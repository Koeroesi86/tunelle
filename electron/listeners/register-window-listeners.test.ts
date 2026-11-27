import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListenerContext } from './listener-context';

type Handler = () => void;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  main: {
    close: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setThumbarButtons: vi.fn(),
    on: vi.fn(),
    webContents: { send: vi.fn(), isDestroyed: () => false },
  },
  languageChanged: undefined as undefined | (() => void),
}));

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, handler: Handler) => mocks.handlers.set(channel, handler) },
  nativeImage: { createFromPath: (path: string) => ({ path }) },
  powerMonitor: { on: (event: string, handler: Handler) => mocks.handlers.set(event, handler) },
}));
vi.mock('../windows/get-main-window', () => ({ getMainWindow: () => mocks.main }));
vi.mock('../language', () => ({
  getMainTranslator: () => ({ t: (key: string) => key }),
  onLanguageChange: (listener: () => void) => {
    mocks.languageChanged = listener;
  },
}));

const load = async (platform: string) => {
  vi.resetModules();
  vi.stubGlobal('process', { ...process, platform });
  return (await import('./register-window-listeners')).default;
};

describe('registerWindowListeners', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    Object.values(mocks.main).forEach((value) => typeof value === 'function' && value.mockReset());
    mocks.main.webContents.send.mockReset();
  });

  it('closes, minimizes and focuses the main window when the window asks', async () => {
    (await load('linux'))({ windows: [] } as unknown as ListenerContext);

    mocks.handlers.get('CLOSE_APP')?.();
    mocks.handlers.get('MINIMIZE_APP')?.();
    mocks.handlers.get('NOTIFICATION_CLICKED')?.();

    expect(mocks.main.close).toHaveBeenCalled();
    expect(mocks.main.minimize).toHaveBeenCalled();
    expect(mocks.main.setAlwaysOnTop.mock.calls).toEqual([[true], [false]]);
    expect(mocks.main.show).toHaveBeenCalled();
    expect(mocks.main.focus).toHaveBeenCalled();
  });

  it('tells the window when it is maximized and restores it on the next ask', async () => {
    (await load('linux'))({ windows: [] } as unknown as ListenerContext);
    const on = (event: string) => mocks.main.on.mock.calls.find(([name]) => name === event)?.[1];

    on('maximize')();
    mocks.handlers.get('MAXIMIZE_APP')?.();
    on('unmaximize')();
    mocks.handlers.get('MAXIMIZE_APP')?.();

    expect(mocks.main.webContents.send.mock.calls).toEqual([
      ['MAXIMIZED_APP', { maximized: true }],
      ['MAXIMIZED_APP', { maximized: false }],
    ]);
    expect(mocks.main.unmaximize).toHaveBeenCalledTimes(1);
    expect(mocks.main.maximize).toHaveBeenCalledTimes(1);
  });

  it('pauses the player when the computer goes to sleep', async () => {
    (await load('linux'))({ windows: [] } as unknown as ListenerContext);

    mocks.handlers.get('suspend')?.();

    expect(mocks.main.webContents.send.mock.calls).toEqual([['SET_PLAYING', { isPlaying: false }]]);
  });

  it('has no playback buttons off Windows', async () => {
    (await load('linux'))({ windows: [] } as unknown as ListenerContext);

    expect(mocks.main.setThumbarButtons).not.toHaveBeenCalled();
  });

  it('puts play and pause on the taskbar of Windows, in the language of the app, and plays and pauses from them', async () => {
    (await load('win32'))({ windows: [] } as unknown as ListenerContext);
    const [[buttons]] = mocks.main.setThumbarButtons.mock.calls;

    buttons[0].click();
    buttons[1].click();
    mocks.languageChanged?.();

    expect(buttons.map(({ tooltip }: { tooltip: string }) => tooltip)).toEqual(['player.play', 'player.pause']);
    expect(mocks.main.webContents.send.mock.calls).toEqual([
      ['SET_PLAYING', { isPlaying: true }],
      ['SET_PLAYING', { isPlaying: false }],
    ]);
    expect(mocks.main.setThumbarButtons).toHaveBeenCalledTimes(2);
  });
});
