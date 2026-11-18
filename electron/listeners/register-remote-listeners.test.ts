import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListenerContext } from './listener-context';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  host: {
    start: vi.fn(),
    update: vi.fn(),
    decide: vi.fn(),
    setControls: vi.fn(),
    setNowPlaying: vi.fn(),
    state: vi.fn(),
  },
  serveAudio: undefined as ((trackPath: string, request: Request) => Promise<Response>) | undefined,
  serveRadio: vi.fn(),
  serveTrack: vi.fn(),
  resolveStream: vi.fn(),
  onChange: undefined as ((state: unknown) => void) | undefined,
  listener: { start: vi.fn(), state: vi.fn(), connect: vi.fn(), control: vi.fn(), confirm: vi.fn(), leave: vi.fn(), audio: vi.fn() },
  onListenerChange: undefined as ((state: unknown) => void) | undefined,
  nearby: { start: vi.fn(), stop: vi.fn() },
  onNearbyChange: undefined as ((hosts: unknown) => void) | undefined,
  ownId: undefined as (() => string | undefined) | undefined,
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '26.11.5' },
  ipcMain: { on: (channel: string, listener: (...args: unknown[]) => void) => mocks.listeners.set(channel, listener) },
}));
vi.mock('../remote/host-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../remote/host-store')>()),
  createHostStore: () => ({}),
}));
vi.mock('../remote/host-controller', () => ({
  advertisementId: (code: string) => code.replace(/\W/g, '').toLowerCase(),
  createHostController: (
    _store: unknown,
    onChange: (state: unknown) => void,
    _onControl: unknown,
    serveAudio: (trackPath: string, request: Request) => Promise<Response>
  ) => {
    mocks.onChange = onChange;
    mocks.serveAudio = serveAudio;
    return mocks.host;
  },
}));

vi.mock('../protocols/radio-protocol', () => ({ serveRadio: mocks.serveRadio }));
vi.mock('../protocols/serve-track', () => ({ serveTrack: mocks.serveTrack }));
vi.mock('../remote/nearby', () => ({
  createNearby: (onChange: (hosts: unknown) => void, ownId: () => string | undefined) => {
    mocks.onNearbyChange = onChange;
    mocks.ownId = ownId;
    return mocks.nearby;
  },
}));
vi.mock('../remote/listener-store', () => ({ createListenerStore: () => ({}) }));
vi.mock('../remote/listener-controller', () => ({
  createListenerController: (_store: unknown, _name: string, onChange: (state: unknown) => void) => {
    mocks.onListenerChange = onChange;
    return mocks.listener;
  },
}));

describe('registerRemoteListeners', () => {
  const main = { webContents: { send: vi.fn(), isDestroyed: () => false } };
  const emit = (channel: string, payload?: unknown) => mocks.listeners.get(channel)?.({ sender: main.webContents }, payload);

  beforeEach(async () => {
    mocks.listeners.clear();
    Object.values({ ...mocks.host, ...mocks.listener, ...mocks.nearby }).forEach((mock) => mock.mockReset());
    Object.values(mocks.listener).forEach((mock) => mock.mockResolvedValue(undefined));
    mocks.nearby.start.mockResolvedValue(undefined);
    mocks.nearby.stop.mockResolvedValue(undefined);
    mocks.host.state.mockReturnValue({ enabled: false });
    mocks.listener.state.mockReturnValue({ status: 'idle' });
    mocks.host.start.mockResolvedValue(undefined);
    mocks.host.update.mockResolvedValue(undefined);
    mocks.host.decide.mockResolvedValue(undefined);
    mocks.host.setControls.mockResolvedValue(undefined);
    main.webContents.send.mockReset();
    global._appDataPath = '/user-data';
    const { default: registerRemoteListeners } = await import('./register-remote-listeners');
    registerRemoteListeners({ windows: { main, loading: null }, radio: { resolveStream: mocks.resolveStream } } as unknown as ListenerContext);
  });

  it('starts the host by its saved settings, which open nothing while host mode is off', () => {
    expect(mocks.host.start).toHaveBeenCalledTimes(1);
  });

  it('sends the state to the page that asked, and every change of it to the main window', () => {
    mocks.host.state.mockReturnValue({ enabled: false });

    emit('GET_REMOTE_HOST');
    mocks.onChange?.({ enabled: true });

    expect(main.webContents.send.mock.calls).toEqual([
      ['REMOTE_HOST_STATE', { enabled: false }],
      ['REMOTE_HOST_STATE', { enabled: true }],
    ]);
  });

  it('changes the settings with the parts that are valid, and drops a message that is not one', async () => {
    emit('SET_REMOTE_HOST', { enabled: true, name: 'Kitchen' });
    emit('SET_REMOTE_HOST', { enabled: 'yes' });
    emit('SET_REMOTE_HOST', { enabled: true, extra: 1 });
    emit('SET_REMOTE_HOST', { port: 80 });

    await vi.waitFor(() => expect(mocks.host.update).toHaveBeenCalledTimes(1));
    expect(mocks.host.update.mock.calls).toEqual([[{ enabled: true, name: 'Kitchen' }]]);
    expect(mocks.listener.leave).not.toHaveBeenCalled();
  });

  it('ends what this app listens to before the host mode goes on, as only one mode runs at a time', async () => {
    mocks.listener.state.mockReturnValue({ status: 'listening' });

    emit('SET_REMOTE_HOST', { name: 'Kitchen' });
    emit('SET_REMOTE_HOST', { enabled: true });

    await vi.waitFor(() => expect(mocks.host.update).toHaveBeenCalledTimes(2));
    expect(mocks.listener.leave).toHaveBeenCalledTimes(1);
    expect(mocks.listener.leave.mock.invocationCallOrder[0]).toBeLessThan(mocks.host.update.mock.invocationCallOrder[1]);
  });

  it('passes on the decision on a device, and drops one for a wrong id or action', () => {
    const deviceId = randomUUID();

    emit('DECIDE_REMOTE_DEVICE', { deviceId, action: 'approve' });
    emit('DECIDE_REMOTE_DEVICE', { deviceId: 'x', action: 'approve' });
    emit('DECIDE_REMOTE_DEVICE', { deviceId, action: 'delete-everything' });

    expect(mocks.host.decide.mock.calls).toEqual([[deviceId, 'approve']]);
  });

  it('passes on the controls of a device, and drops a control that does not exist', () => {
    const deviceId = randomUUID();

    emit('SET_REMOTE_DEVICE_CONTROLS', { deviceId, controls: ['seek', 'volume'] });
    emit('SET_REMOTE_DEVICE_CONTROLS', { deviceId, controls: ['shutdown'] });

    expect(mocks.host.setControls.mock.calls).toEqual([[deviceId, ['seek', 'volume']]]);
  });

  it('hands the now playing of the page to the host as it came, for the host to check', () => {
    emit('REMOTE_STATE', { state: 'idle' });

    expect(mocks.host.setNowPlaying).toHaveBeenCalledWith({ state: 'idle' });
  });

  describe('the listener side', () => {
    it('follows the host of the last approval from the start', () => {
      expect(mocks.listener.start).toHaveBeenCalledTimes(1);
    });

    it('sends the state to the page that asked, and every change of it to the main window', () => {
      mocks.listener.state.mockReturnValue({ status: 'idle' });

      emit('GET_REMOTE_LISTENER');
      mocks.onListenerChange?.({ status: 'listening' });

      expect(main.webContents.send.mock.calls).toEqual([
        ['REMOTE_LISTENER_STATE', { status: 'idle' }],
        ['REMOTE_LISTENER_STATE', { status: 'listening' }],
      ]);
    });

    it('contacts the host the page named, and drops a port or address that is not valid', async () => {
      emit('CONNECT_REMOTE_HOST', { host: '192.168.1.5', port: 40000 });
      emit('CONNECT_REMOTE_HOST', { host: '', port: 40000 });
      emit('CONNECT_REMOTE_HOST', { host: 'x', port: 80 });
      emit('CONNECT_REMOTE_HOST', { host: 'x', port: '40000' });

      await vi.waitFor(() => expect(mocks.listener.connect).toHaveBeenCalledTimes(1));
      expect(mocks.listener.connect.mock.calls).toEqual([[{ host: '192.168.1.5', port: 40000 }]]);
      expect(mocks.host.update).not.toHaveBeenCalled();
    });

    it('turns the host mode off before it contacts a host, as only one mode runs at a time', async () => {
      mocks.host.state.mockReturnValue({ enabled: true });

      emit('CONNECT_REMOTE_HOST', { host: '192.168.1.5', port: 40000 });

      await vi.waitFor(() => expect(mocks.listener.connect).toHaveBeenCalledTimes(1));
      expect(mocks.host.update).toHaveBeenCalledExactlyOnceWith({ enabled: false });
      expect(mocks.host.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.listener.connect.mock.invocationCallOrder[0]);
    });

    it('passes on the note of the request, and drops one that is too long', () => {
      emit('CONFIRM_REMOTE_HOST', { note: 'the kitchen' });
      emit('CONFIRM_REMOTE_HOST', { note: 'x'.repeat(201) });

      expect(mocks.listener.confirm.mock.calls).toEqual([['the kitchen']]);
    });

    it('passes on a command of the page to the host, and drops one that is not a command', () => {
      emit('SEND_REMOTE_CONTROL', { control: 'skip', direction: 'next' });
      emit('SEND_REMOTE_CONTROL', { control: 'volume', level: 2 });
      emit('SEND_REMOTE_CONTROL', { control: 'shutdown' });

      expect(mocks.listener.control.mock.calls).toEqual([[{ control: 'skip', direction: 'next' }]]);
    });

    it('leaves the host', () => {
      emit('LEAVE_REMOTE_HOST');

      expect(mocks.listener.leave).toHaveBeenCalledTimes(1);
    });
  });

  describe('the nearby list', () => {
    it('opens and closes the list as the page asks, and drops a request that is not one', () => {
      emit('BROWSE_REMOTE_NEARBY', { active: true });
      emit('BROWSE_REMOTE_NEARBY', { active: false });
      emit('BROWSE_REMOTE_NEARBY', { active: 'yes' });
      emit('BROWSE_REMOTE_NEARBY', undefined);

      expect(mocks.nearby.start).toHaveBeenCalledTimes(1);
      expect(mocks.nearby.stop).toHaveBeenCalledTimes(1);
    });

    it('leaves the host of this app out by the id it advertises, and none while host mode is off', () => {
      mocks.host.state.mockReturnValue({ code: '3F9A 04C1' });
      expect(mocks.ownId?.()).toBe('3f9a04c1');

      mocks.host.state.mockReturnValue({ code: undefined });
      expect(mocks.ownId?.()).toBeUndefined();
    });

    it('sends the hosts that were found to the main window', () => {
      mocks.onNearbyChange?.([{ id: 'a' }]);

      expect(main.webContents.send).toHaveBeenCalledWith('REMOTE_NEARBY', [{ id: 'a' }]);
    });
  });

  it('serves a station from the stream of the station and a file from the library, to the listeners of the host', async () => {
    const request = new Request('https://host/remote/audio');
    mocks.serveRadio.mockResolvedValue(new Response('live'));
    mocks.serveTrack.mockResolvedValue(new Response('file'));

    await mocks.serveAudio?.('station:b3f1c1a0-0000-4000-8000-000000000001', request);
    await mocks.serveAudio?.('/music/song.flac', request);

    expect(mocks.serveRadio).toHaveBeenCalledExactlyOnceWith(
      'b3f1c1a0-0000-4000-8000-000000000001',
      request.signal,
      expect.objectContaining({ resolveStream: expect.any(Function) })
    );
    expect(mocks.serveTrack).toHaveBeenCalledExactlyOnceWith(undefined, '/music/song.flac', request);
  });
});
