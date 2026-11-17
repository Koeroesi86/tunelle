import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteListenerState } from '../../shared/schemas/remote-listener';
import { approvalCode } from './certificate';
import { contact, fetchNowPlaying, requestToListen } from './listener-client';
import { ASK_LIMIT_MS, createListenerController, POLL_MS } from './listener-controller';
import type { ListenerStore, Pairing } from './listener-store';

vi.mock('./listener-client');
vi.mock('./certificate', () => ({ approvalCode: vi.fn(() => 'ABCD-1234') }));

describe('the listener controller', () => {
  const address = { host: '192.168.1.5', port: 40000 };
  const deviceId = '5d1a3b0e-6a3c-4a53-8a6e-0f7a2f0a9d11';
  const pairing: Pairing = { ...address, certificate: 'PEM', secret: 'secret' };
  const snapshot = { state: 'playing', title: 'Song', position: 3, at: 0 } as const;

  const store = {
    readPairing: vi.fn(),
    deviceId: vi.fn(),
    savePairing: vi.fn(),
    clearPairing: vi.fn(),
  } satisfies ListenerStore;
  let states: RemoteListenerState[];
  let listener: ReturnType<typeof createListenerController>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.mocked(approvalCode).mockReturnValue('ABCD-1234');
    store.readPairing.mockResolvedValue(undefined);
    store.deviceId.mockResolvedValue(deviceId);
    store.savePairing.mockResolvedValue(undefined);
    store.clearPairing.mockResolvedValue(undefined);
    vi.mocked(contact).mockResolvedValue({ certificate: 'PEM', code: 'ABCD-1234' });
    states = [];
    listener = createListenerController(store, 'Laptop', (state) => states.push(state));
  });

  afterEach(async () => {
    await listener.leave();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  // a loop that sleeps on a fake timer ends at its next wake up, after the listener left
  const leaveAnd = async (running: Promise<void>) => {
    await listener.leave();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await running;
  };

  const statuses = () => states.map(({ status }) => status);

  it('shows the code of the host and asks nothing before the user confirmed it', async () => {
    await listener.connect(address);

    expect(states.at(-1)).toEqual({ status: 'confirming', target: address, code: 'ABCD-1234' });
    expect(requestToListen).not.toHaveBeenCalled();
  });

  it('reports a host that cannot be reached', async () => {
    vi.mocked(contact).mockRejectedValue(new Error('connect ECONNREFUSED'));

    await listener.connect(address);

    expect(states.at(-1)).toEqual({ status: 'error', target: address, error: 'connect ECONNREFUSED' });
  });

  it('does nothing on a confirm that has no contact before it', async () => {
    await listener.confirm('hello');

    expect(requestToListen).not.toHaveBeenCalled();
  });

  it('asks pinned to the certificate that gave the code, until the host approves, and keeps the pairing', async () => {
    vi.mocked(requestToListen).mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'approved', secret: 'secret' });
    vi.mocked(fetchNowPlaying).mockResolvedValue(snapshot);
    await listener.connect(address);

    const asking = listener.confirm('the kitchen');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(requestToListen).toHaveBeenCalledWith(address, 'PEM', { deviceId, deviceName: 'Laptop', note: 'the kitchen' });
    expect(store.savePairing).toHaveBeenCalledWith(pairing);
    expect(states.at(-1)).toEqual({ status: 'listening', target: address, code: 'ABCD-1234', nowPlaying: snapshot });
    expect(statuses()).toContain('waiting');
    await leaveAnd(asking);
  });

  it('says blocked when the host blocked the device', async () => {
    vi.mocked(requestToListen).mockResolvedValue({ status: 'blocked' });
    await listener.connect(address);
    await listener.confirm('');

    expect(states.at(-1)?.status).toBe('blocked');
  });

  it('explains an approval whose secret was picked up before', async () => {
    vi.mocked(requestToListen).mockResolvedValue({ status: 'approved' });
    await listener.connect(address);
    await listener.confirm('');

    expect(states.at(-1)).toMatchObject({ status: 'error', error: expect.stringContaining('revoke') });
    expect(store.savePairing).not.toHaveBeenCalled();
  });

  it.each(['rate-limited', 'full', 'invalid'])('stops on the answer %s, with the answer as the reason', async (status) => {
    vi.mocked(requestToListen).mockResolvedValue({ status });
    await listener.connect(address);
    await listener.confirm('');

    expect(states.at(-1)).toMatchObject({ status: 'error', error: `The host answered ${status}` });
  });

  it('stops asking when nobody answers for as long as the host keeps a request', async () => {
    vi.mocked(requestToListen).mockResolvedValue({ status: 'pending' });
    await listener.connect(address);

    const asking = listener.confirm('');
    await vi.advanceTimersByTimeAsync(ASK_LIMIT_MS + POLL_MS);
    await asking;

    expect(states.at(-1)).toMatchObject({ status: 'error', error: 'Nobody answered the request on the host' });
  });

  it('reports a failed request instead of throwing', async () => {
    vi.mocked(requestToListen).mockRejectedValue(new Error('self-signed certificate'));
    await listener.connect(address);
    await listener.confirm('');

    expect(states.at(-1)).toEqual({ status: 'error', target: address, code: 'ABCD-1234', error: 'self-signed certificate' });
  });

  describe('with a host it was approved by', () => {
    beforeEach(() => store.readPairing.mockResolvedValue(pairing));

    it('follows the now playing from the start, once a second, and shows an error without losing the last track', async () => {
      vi.mocked(fetchNowPlaying)
        .mockResolvedValueOnce(snapshot)
        .mockRejectedValueOnce(new Error('The host did not answer'))
        .mockResolvedValue({ state: 'idle' });

      const following = listener.start();
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(fetchNowPlaying).toHaveBeenCalledWith(address, 'PEM', deviceId, 'secret');
      expect(states.map(({ nowPlaying, error }) => [nowPlaying?.state, error])).toEqual([
        [undefined, undefined],
        ['playing', undefined],
        ['playing', 'The host did not answer'],
        ['idle', undefined],
      ]);
      await leaveAnd(following);
    });

    it('forgets the pairing when the host does not know the device any more', async () => {
      vi.mocked(fetchNowPlaying).mockResolvedValue(undefined);

      await listener.start();

      expect(store.clearPairing).toHaveBeenCalled();
      expect(states.at(-1)).toEqual({ status: 'revoked', target: address, code: 'ABCD-1234' });
    });

    it('stops following when the user leaves, and forgets the host', async () => {
      vi.mocked(fetchNowPlaying).mockResolvedValue(snapshot);
      const following = listener.start();
      await vi.advanceTimersByTimeAsync(0);

      await leaveAnd(following);
      const calls = vi.mocked(fetchNowPlaying).mock.calls.length;
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);

      expect(vi.mocked(fetchNowPlaying).mock.calls.length).toBe(calls);
      expect(store.clearPairing).toHaveBeenCalled();
      expect(states.at(-1)).toEqual({ status: 'idle' });
    });

    it('lets a new contact end the host that was followed', async () => {
      vi.mocked(fetchNowPlaying).mockResolvedValue(snapshot);
      const following = listener.start();
      await vi.advanceTimersByTimeAsync(0);

      await listener.connect({ host: '10.0.0.2', port: 41000 });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      await following;

      expect(states.at(-1)).toMatchObject({ status: 'confirming', target: { host: '10.0.0.2' } });
    });
  });

  it('is idle with nothing approved', async () => {
    await listener.start();

    expect(listener.state()).toEqual({ status: 'idle' });
    expect(fetchNowPlaying).not.toHaveBeenCalled();
  });
});
