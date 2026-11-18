import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NowPlaying } from '../../shared/schemas/now-playing';
import type { RemoteListenerState } from '../../shared/schemas/remote-listener';
import { approvalCode } from './certificate';
import { contact, fetchAudio, followNowPlaying, requestToListen, sendControl } from './listener-client';
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

  // a stream that gives the snapshots and stays open until the controller closes it
  const streaming =
    (...snapshots: NowPlaying[]): typeof followNowPlaying =>
    (_address, _certificate, _deviceId, _secret, { onSnapshot }, signal) =>
      new Promise((resolve, reject) => {
        snapshots.forEach(onSnapshot);
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });

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
    vi.mocked(followNowPlaying).mockImplementation(streaming(snapshot));
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

    it('follows the now playing as the host sends it, with no polling, and reconnects after the host closed the stream, without losing the last track', async () => {
      vi.mocked(followNowPlaying)
        .mockImplementationOnce(async (_a, _c, _d, _s, { onSnapshot }) => (onSnapshot(snapshot), 'ended'))
        .mockRejectedValueOnce(new Error('The host did not answer'))
        .mockImplementation(streaming({ state: 'idle' }));

      const following = listener.start();
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(followNowPlaying).toHaveBeenCalledWith(
        address,
        'PEM',
        deviceId,
        'secret',
        { onSnapshot: expect.any(Function), onControls: expect.any(Function) },
        expect.any(AbortSignal)
      );
      expect(followNowPlaying).toHaveBeenCalledTimes(3);
      expect(states.map(({ nowPlaying, error }) => [nowPlaying?.state, error])).toEqual([
        [undefined, undefined],
        ['playing', undefined],
        ['playing', 'The host closed the connection'],
        ['playing', 'The host did not answer'],
        ['idle', undefined],
      ]);
      await leaveAnd(following);
    });

    it('shows what the host allows this device to control, and keeps it with the next snapshot', async () => {
      vi.mocked(followNowPlaying).mockImplementation(async (_a, _c, _d, _s, { onSnapshot, onControls }, signal) => {
        onControls(['skip']);
        onSnapshot(snapshot);
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      });

      void listener.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(states.at(-1)).toMatchObject({ status: 'listening', controls: ['skip'], nowPlaying: { state: 'playing' } });
    });

    it('sends a command to the host that is followed, and shows why the host refused it', async () => {
      vi.mocked(followNowPlaying).mockImplementation(streaming(snapshot));
      vi.mocked(sendControl).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('The host answered 403'));
      void listener.start();
      await vi.advanceTimersByTimeAsync(0);

      await listener.control({ control: 'skip', direction: 'next' });
      expect(sendControl).toHaveBeenCalledWith(address, 'PEM', deviceId, 'secret', { control: 'skip', direction: 'next' });
      expect(states.at(-1)?.error).toBeUndefined();

      await listener.control({ control: 'volume', level: 0.3 });
      expect(states.at(-1)).toMatchObject({ status: 'listening', error: 'The host answered 403', nowPlaying: { state: 'playing' } });
    });

    it('sends nothing when no host is followed', async () => {
      await listener.control({ control: 'skip', direction: 'next' });

      expect(sendControl).not.toHaveBeenCalled();
    });

    it('forgets the pairing when the host does not know the device any more', async () => {
      vi.mocked(followNowPlaying).mockResolvedValue('revoked');

      await listener.start();

      expect(store.clearPairing).toHaveBeenCalled();
      expect(states.at(-1)).toEqual({ status: 'revoked', target: address, code: 'ABCD-1234' });
    });

    it('stops following when the user leaves, and forgets the host', async () => {
      vi.mocked(followNowPlaying).mockImplementation(streaming(snapshot));
      const following = listener.start();
      await vi.advanceTimersByTimeAsync(0);

      await leaveAnd(following);
      const calls = vi.mocked(followNowPlaying).mock.calls.length;
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);

      expect(vi.mocked(followNowPlaying).mock.calls.length).toBe(calls);
      expect(store.clearPairing).toHaveBeenCalled();
      expect(states.at(-1)).toEqual({ status: 'idle' });
    });

    it('closes the stream of the host when the user leaves, at once', async () => {
      let signal: AbortSignal | undefined;
      vi.mocked(followNowPlaying).mockImplementation((_a, _c, _d, _s, _on, stop) => ((signal = stop), new Promise(() => undefined)));
      void listener.start();
      await vi.advanceTimersByTimeAsync(0);

      await listener.leave();

      expect(signal?.aborted).toBe(true);
    });

    it('lets a new contact end the host that was followed', async () => {
      vi.mocked(followNowPlaying).mockImplementation(streaming(snapshot));
      const following = listener.start();
      await vi.advanceTimersByTimeAsync(0);

      await listener.connect({ host: '10.0.0.2', port: 41000 });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      await following;

      expect(states.at(-1)).toMatchObject({ status: 'confirming', target: { host: '10.0.0.2' } });
    });
  });

  describe('the audio of the host', () => {
    const audioRequest = (range?: string) => new Request('tunelle://app/remote/audio', { headers: range ? { range } : {} });

    it('has none before a host approved this device', async () => {
      expect((await listener.audio(audioRequest())).status).toBe(404);
      expect(fetchAudio).not.toHaveBeenCalled();
    });

    it('comes from the host that is followed, with the range of the request, and from no other', async () => {
      store.readPairing.mockResolvedValue(pairing);
      vi.mocked(followNowPlaying).mockImplementation(streaming(snapshot));
      vi.mocked(fetchAudio).mockResolvedValue(new Response('2345', { status: 206 }));
      const following = listener.start();
      await vi.advanceTimersByTimeAsync(0);

      const answer = await listener.audio(audioRequest('bytes=2-5'));

      expect(answer.status).toBe(206);
      expect(fetchAudio).toHaveBeenCalledWith(address, 'PEM', deviceId, 'secret', 'bytes=2-5', expect.any(AbortSignal));
      await listener.leave();
      expect((await listener.audio(audioRequest())).status).toBe(404);
      await vi.advanceTimersByTimeAsync(POLL_MS);
      await following;
    });

    it('answers 502 when the host cannot be reached', async () => {
      store.readPairing.mockResolvedValue(pairing);
      vi.mocked(followNowPlaying).mockImplementation(streaming(snapshot));
      vi.mocked(fetchAudio).mockRejectedValue(new Error('ECONNRESET'));
      const following = listener.start();
      await vi.advanceTimersByTimeAsync(0);

      expect((await listener.audio(audioRequest())).status).toBe(502);
      await listener.leave();
      await vi.advanceTimersByTimeAsync(POLL_MS);
      await following;
    });
  });

  it('is idle with nothing approved', async () => {
    await listener.start();

    expect(listener.state()).toEqual({ status: 'idle' });
    expect(followNowPlaying).not.toHaveBeenCalled();
  });
});
