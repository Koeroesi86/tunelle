import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { MprisCommand, MprisState } from '../services/mpris';
import type { ListenerContext } from './listener-context';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  appListeners: new Map<string, () => void>(),
  quit: vi.fn(),
  startMpris: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getName: () => 'Tunelle',
    quit: mocks.quit,
    on: (event: string, listener: () => void) => mocks.appListeners.set(event, listener),
  },
  ipcMain: { on: (channel: string, listener: (...args: unknown[]) => void) => mocks.listeners.set(channel, listener) },
}));
vi.mock('../services/mpris', async (importOriginal) => ({ ...(await importOriginal<typeof import('../services/mpris')>()), startMpris: mocks.startMpris }));
vi.mock('../services/mpris-cover', () => ({ coverFolder: () => '/covers', createCoverFiles: () => ({ write: mocks.write, clear: mocks.clear }) }));

const event = {} as IpcMainEvent;
const track = { title: 'Song', artist: 'Artist', album: 'Album', duration: 200, coverUrl: undefined };
const playing: MprisState = { track, playing: true, position: 0, seeked: false };

describe('registerMprisListeners', () => {
  const service = { update: vi.fn(), close: vi.fn() };
  const main = { show: vi.fn(), focus: vi.fn(), webContents: { send: vi.fn(), isDestroyed: () => false } };
  let onCommand: (command: MprisCommand) => void;

  const register = async () => {
    const { default: registerMprisListeners } = await import('./register-mpris-listeners');
    registerMprisListeners({ windows: { main, loading: null } } as unknown as ListenerContext);
    await vi.waitFor(() => expect(service.update).toHaveBeenCalled());
  };
  const send = (channel: string, payload?: unknown) => {
    const listener = mocks.listeners.get(channel);
    if (!listener) throw new Error(`No listener for ${channel}`);
    (listener as Listener)(event, payload);
  };

  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    mocks.listeners.clear();
    mocks.appListeners.clear();
    mocks.startMpris.mockImplementation(async (_name: string, _id: string | undefined, handler: (command: MprisCommand) => void) => {
      onCommand = handler;
      return service;
    });
    mocks.write.mockResolvedValue('file:///covers/cover-1.png');
    mocks.clear.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it('does nothing outside Linux', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const { default: registerMprisListeners } = await import('./register-mpris-listeners');

    registerMprisListeners({ windows: { main, loading: null } } as unknown as ListenerContext);

    expect(mocks.startMpris).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });

  it('starts the service under the name of the app and the Flatpak id', async () => {
    vi.stubEnv('FLATPAK_ID', 'io.github.koeroesi86.Tunelle');
    await register();

    expect(mocks.startMpris).toHaveBeenCalledWith('Tunelle', 'io.github.koeroesi86.Tunelle', expect.any(Function));
  });

  it('hands the state of the page to the service', async () => {
    await register();
    send('MPRIS_STATE', playing);

    expect(service.update).toHaveBeenLastCalledWith(playing);
  });

  it('writes the cover that arrives and sends the track again with it, and drops it for the next track', async () => {
    await register();
    send('MPRIS_STATE', playing);
    send('MPRIS_COVER', { bytes: new Uint8Array([1]), type: 'image/png' });

    await vi.waitFor(() => expect(service.update).toHaveBeenLastCalledWith({ ...playing, track: { ...track, coverUrl: 'file:///covers/cover-1.png' } }));

    send('MPRIS_COVER', undefined);
    expect(mocks.clear).toHaveBeenCalled();
    expect(service.update).toHaveBeenLastCalledWith(playing);
  });

  it('keeps going without the cover when it can not be written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.write.mockRejectedValue(new Error('disk full'));
    await register();
    send('MPRIS_COVER', { bytes: new Uint8Array([1]), type: 'image/png' });

    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it('ignores a cover that is not bytes with a type', async () => {
    await register();
    send('MPRIS_COVER', { bytes: 'no', type: 3 });

    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalled();
  });

  it('sends the commands to the page, raises the window and quits', async () => {
    await register();
    onCommand({ name: 'next' });
    onCommand({ name: 'raise' });
    onCommand({ name: 'quit' });

    expect(main.webContents.send).toHaveBeenCalledWith('MPRIS_COMMAND', { name: 'next' });
    expect(main.show).toHaveBeenCalled();
    expect(main.focus).toHaveBeenCalled();
    expect(mocks.quit).toHaveBeenCalled();
  });

  it('leaves the service and the cover when the app quits', async () => {
    await register();
    mocks.appListeners.get('will-quit')?.();

    expect(service.close).toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalled();
  });

  it('says so and goes on when the service can not start', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.startMpris.mockRejectedValue(new Error('no bus'));
    const { default: registerMprisListeners } = await import('./register-mpris-listeners');

    registerMprisListeners({ windows: { main, loading: null } } as unknown as ListenerContext);
    send('MPRIS_STATE', playing);

    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(service.update).not.toHaveBeenCalled();
  });
});
