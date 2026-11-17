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
  onChange: undefined as ((state: unknown) => void) | undefined,
  listener: { start: vi.fn(), state: vi.fn(), connect: vi.fn(), confirm: vi.fn(), leave: vi.fn() },
  onListenerChange: undefined as ((state: unknown) => void) | undefined,
}));

vi.mock('electron', () => ({ ipcMain: { on: (channel: string, listener: (...args: unknown[]) => void) => mocks.listeners.set(channel, listener) } }));
vi.mock('../remote/host-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../remote/host-store')>()),
  createHostStore: () => ({}),
}));
vi.mock('../remote/host-controller', () => ({
  createHostController: (_store: unknown, onChange: (state: unknown) => void) => {
    mocks.onChange = onChange;
    return mocks.host;
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
    Object.values({ ...mocks.host, ...mocks.listener }).forEach((mock) => mock.mockReset());
    Object.values(mocks.listener).forEach((mock) => mock.mockResolvedValue(undefined));
    mocks.host.start.mockResolvedValue(undefined);
    mocks.host.update.mockResolvedValue(undefined);
    mocks.host.decide.mockResolvedValue(undefined);
    mocks.host.setControls.mockResolvedValue(undefined);
    main.webContents.send.mockReset();
    global._appDataPath = '/user-data';
    const { default: registerRemoteListeners } = await import('./register-remote-listeners');
    registerRemoteListeners({ windows: { main, loading: null } } as unknown as ListenerContext);
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

  it('changes the settings with the parts that are valid, and drops a message that is not one', () => {
    emit('SET_REMOTE_HOST', { enabled: true, name: 'Kitchen' });
    emit('SET_REMOTE_HOST', { enabled: 'yes' });
    emit('SET_REMOTE_HOST', { enabled: true, extra: 1 });
    emit('SET_REMOTE_HOST', { port: 80 });

    expect(mocks.host.update.mock.calls).toEqual([[{ enabled: true, name: 'Kitchen' }]]);
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

    it('contacts the host the page named, and drops a port or address that is not valid', () => {
      emit('CONNECT_REMOTE_HOST', { host: '192.168.1.5', port: 40000 });
      emit('CONNECT_REMOTE_HOST', { host: '', port: 40000 });
      emit('CONNECT_REMOTE_HOST', { host: 'x', port: 80 });
      emit('CONNECT_REMOTE_HOST', { host: 'x', port: '40000' });

      expect(mocks.listener.connect.mock.calls).toEqual([[{ host: '192.168.1.5', port: 40000 }]]);
    });

    it('passes on the note of the request, and drops one that is too long', () => {
      emit('CONFIRM_REMOTE_HOST', { note: 'the kitchen' });
      emit('CONFIRM_REMOTE_HOST', { note: 'x'.repeat(201) });

      expect(mocks.listener.confirm.mock.calls).toEqual([['the kitchen']]);
    });

    it('leaves the host', () => {
      emit('LEAVE_REMOTE_HOST');

      expect(mocks.listener.leave).toHaveBeenCalledTimes(1);
    });
  });
});
