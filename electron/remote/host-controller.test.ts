import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostState } from './host-controller';
import type { HostStore } from './host-store';
import type { NowPlaying } from './now-playing';
import { remoteHostStateSchema } from '../../shared/schemas/remote-host';

const mocks = vi.hoisted(() => ({ start: vi.fn(), close: vi.fn(), setNowPlaying: vi.fn() }));

vi.mock('./host-server', () => ({ startHostServer: mocks.start }));
vi.mock('./certificate', () => ({ approvalCode: () => '3F9A 04C1' }));

const taken = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
const identity = { certificate: 'cert', key: 'key' };
const playing: NowPlaying = { state: 'playing', title: 'Song', position: 3, at: 1000 };

const fakeStore = (settings: Record<string, unknown> = {}): HostStore => ({
  readSettings: vi.fn().mockResolvedValue({ enabled: false, name: 'Tunelle', loopbackOnly: false, ...settings }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  readDevices: vi.fn().mockResolvedValue([]),
  saveDevices: vi.fn().mockResolvedValue(undefined),
  identity: vi.fn().mockResolvedValue(identity),
});

describe('the host controller', () => {
  const states: HostState[] = [];
  const commands: unknown[] = [];
  const create = async (store: HostStore) => {
    const { createHostController } = await import('./host-controller');
    return createHostController(store, (state) => states.push(state), commands.push.bind(commands));
  };
  const last = () => states[states.length - 1];

  beforeEach(() => {
    states.length = 0;
    mocks.start
      .mockReset()
      .mockImplementation(async ({ port }: { port?: number }) => ({ port: port || 41000, setNowPlaying: mocks.setNowPlaying, close: mocks.close }));
    mocks.close.mockReset().mockResolvedValue(undefined);
    mocks.setNowPlaying.mockReset();
  });

  it('gives the server the file of the track with the snapshot, and starts a later server with the last one', async () => {
    const host = await create(fakeStore({ enabled: true }));
    await host.start();
    host.setNowPlaying({ state: 'playing', title: 'Song', position: 1, at: 2, path: '/music/song.flac' });

    expect(mocks.setNowPlaying).toHaveBeenCalledWith({ state: 'playing', title: 'Song', position: 1, at: 2 }, '/music/song.flac');

    await host.start();
    expect(mocks.setNowPlaying).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Song' }), '/music/song.flac');
  });

  it('hands the server the way to the page for the commands of a listener', async () => {
    const host = await create(fakeStore({ enabled: true }));
    await host.start();

    mocks.start.mock.calls[0][0].onControl({ control: 'skip', direction: 'next' });

    expect(commands).toEqual([{ control: 'skip', direction: 'next' }]);
  });

  it('reports a state that the page accepts, with a device waiting and one approved', async () => {
    const host = await create(fakeStore({ enabled: true }));
    await host.start();
    const { access } = mocks.start.mock.calls[0][0];
    const [waiting, approved] = [randomUUID(), randomUUID()];
    access.request('10.0.0.2', { deviceId: approved, deviceName: 'Phone' });
    access.approve(approved, ['skip']);
    access.request('10.0.0.3', { deviceId: waiting, deviceName: 'Tablet', note: 'Hi' });

    expect(remoteHostStateSchema.parse(host.state())).toMatchObject({
      pending: [{ deviceId: waiting }],
      devices: [{ id: approved, controls: ['skip'] }],
      running: true,
    });
  });

  it('opens nothing while host mode is off', async () => {
    const host = await create(fakeStore());

    await host.start();

    expect(mocks.start).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ enabled: false, running: false, code: undefined });
  });

  it('listens on the saved settings when host mode is on, shows the code and saves the port it got', async () => {
    const store = fakeStore({ enabled: true, loopbackOnly: true });
    const host = await create(store);

    await host.start();

    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ identity, loopbackOnly: true, port: undefined }));
    expect(last()).toMatchObject({ running: true, code: '3F9A 04C1', port: 41000 });
    expect(store.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ port: 41000 }));
  });

  it('reuses the saved port, and takes a free one when it is taken', async () => {
    const store = fakeStore({ enabled: true, port: 40000 });
    mocks.start.mockRejectedValueOnce(taken);
    const host = await create(store);

    await host.start();

    expect(mocks.start.mock.calls.map(([options]) => options.port)).toEqual([40000, 0]);
    expect(last().port).toBe(41000);
  });

  it('reports a start that fails and listens on nothing', async () => {
    mocks.start.mockRejectedValue(new Error('listen EACCES'));
    const host = await create(fakeStore({ enabled: true }));

    await host.start();

    expect(last()).toMatchObject({ running: false, error: 'listen EACCES' });
  });

  it('stops the server when the setting is turned off, and starts a new one when it is turned on', async () => {
    const host = await create(fakeStore({ enabled: true }));
    await host.start();

    await host.update({ enabled: false });
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(last().running).toBe(false);

    await host.update({ enabled: true });
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('stops by itself', async () => {
    const host = await create(fakeStore({ enabled: true }));
    await host.start();

    await host.stop();

    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(last().running).toBe(false);
  });

  it('gives the server the now playing that came before it, and the ones that come after', async () => {
    const host = await create(fakeStore({ enabled: true }));
    host.setNowPlaying(playing);

    await host.start();
    host.setNowPlaying({ ...playing, position: 9 });

    expect(mocks.setNowPlaying.mock.calls.map(([snapshot]) => snapshot.position)).toEqual([3, 9]);
  });

  it('drops a now playing that is not one', async () => {
    const host = await create(fakeStore({ enabled: true }));
    await host.start();

    host.setNowPlaying({ state: 'playing' });

    expect(mocks.setNowPlaying).not.toHaveBeenCalled();
  });

  describe('devices', () => {
    const waiting = async (store: HostStore) => {
      const host = await create(store);
      await host.start();
      const deviceId = randomUUID();
      const [{ access }] = mocks.start.mock.calls.map(([options]) => options);
      access.request('10.0.0.2', { deviceId, deviceName: 'Speaker', note: 'Hi' });
      return { host, deviceId };
    };

    it('shows a request that starts to wait, without its address or anything else', async () => {
      const { deviceId } = await waiting(fakeStore({ enabled: true }));

      expect(last().pending).toEqual([{ deviceId, deviceName: 'Speaker', note: 'Hi', at: expect.any(Number) }]);
    });

    it('saves an approval, a revoke and a block, and shows the devices', async () => {
      const store = fakeStore({ enabled: true });
      const { host, deviceId } = await waiting(store);

      await host.decide(deviceId, 'approve');
      expect(last()).toMatchObject({ pending: [], devices: [{ id: deviceId, blocked: false, controls: [] }] });

      await host.setControls(deviceId, ['seek']);
      expect(last().devices[0].controls).toEqual(['seek']);

      await host.decide(deviceId, 'block');
      expect(last().devices[0]).toMatchObject({ blocked: true });
      expect(store.saveDevices).toHaveBeenCalledTimes(3);

      await host.decide(deviceId, 'revoke');
      expect(last().devices).toEqual([]);
    });

    it('writes nothing for a device that did not ask', async () => {
      const store = fakeStore({ enabled: true });
      const { host } = await waiting(store);

      await host.decide(randomUUID(), 'approve');
      await host.decide(randomUUID(), 'deny');
      await host.setControls(randomUUID(), ['seek']);

      expect(store.saveDevices).not.toHaveBeenCalled();
    });

    it('denies a waiting request', async () => {
      const store = fakeStore({ enabled: true });
      const { host, deviceId } = await waiting(store);

      await host.decide(deviceId, 'deny');

      expect(last().pending).toEqual([]);
    });
  });
});
