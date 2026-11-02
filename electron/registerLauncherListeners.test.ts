import { mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { posix } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { LauncherOptions } from './appImageLauncher';

// the entry only takes paths without a backslash, the temporary folder of Windows is full of them
const { join } = posix;

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();
let home: string;

vi.mock('electron', () => ({
  app: { getPath: (name: string) => join(home, name) },
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));

// the listeners find the icons relative to the compiled files, the tests bring their own
vi.mock('./appImageLauncher', async (importOriginal) => {
  const original = await importOriginal<typeof import('./appImageLauncher')>();
  return {
    ...original,
    enableLauncher: (appImage: string, options: LauncherOptions) => original.enableLauncher(appImage, { ...options, iconsPath: join(home, 'icons') }),
  };
});

const registerLauncherListeners = async () => (await import('./registerLauncherListeners')).default;

describe('registerLauncherListeners', () => {
  const send = vi.fn();
  const event = { sender: { send } } as unknown as IpcMainEvent;
  const appImage = () => join(home, 'Apps/Tunelle.AppImage');
  const desktopFile = () => join(home, 'data/applications/tunelle.desktop');
  const lastState = () => new Promise((resolve) => send.mockImplementation((_channel, state) => resolve(state)));

  beforeEach(async () => {
    home = (await mkdtemp(join(tmpdir(), 'tunelle-listeners-'))).replaceAll('\\', '/');
    await mkdir(join(home, 'icons'));
    await Promise.all([16, 24, 32, 48, 64, 128, 256, 512].map((size) => writeFile(join(home, 'icons', `${size}x${size}.png`), '')));
    vi.stubEnv('XDG_DATA_HOME', join(home, 'data'));
    listeners.clear();
    send.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  it('listens to nothing outside an AppImage', async () => {
    (await registerLauncherListeners())(undefined, undefined);

    expect(listeners.size).toBe(0);
  });

  it('reports that the user was not asked yet on the first run', async () => {
    (await registerLauncherListeners())(undefined, appImage());
    const state = lastState();

    listeners.get('APP_READY')?.(event);

    await expect(state).resolves.toEqual({ available: true, enabled: false, offered: false, external: false });
  });

  it('adds the app to the menu when the user agrees, and remembers it was asked', async () => {
    (await registerLauncherListeners())(undefined, appImage());
    const state = lastState();

    listeners.get('SET_LAUNCHER')?.(event, { enabled: true });

    await expect(state).resolves.toEqual({ available: true, enabled: true, offered: true, external: false });
    await expect(readFile(desktopFile(), 'utf8')).resolves.toContain(`Exec="${join(home, 'data/tunelle/Tunelle.AppImage')}"`);
    await expect(readlink(join(home, 'data/tunelle/Tunelle.AppImage')).then((target) => target.replaceAll('\\', '/'))).resolves.toBe(appImage());
  });

  it('remembers it was asked when the user declines, and adds nothing', async () => {
    (await registerLauncherListeners())(undefined, appImage());
    const state = lastState();

    listeners.get('SET_LAUNCHER')?.(event, { enabled: false });

    await expect(state).resolves.toEqual({ available: true, enabled: false, offered: true, external: false });
    await expect(stat(desktopFile())).rejects.toThrow();
  });

  describe('when another tool has an entry for this AppImage', () => {
    beforeEach(async () => {
      await mkdir(join(home, 'data/applications'), { recursive: true });
      await writeFile(join(home, 'data/applications/appimagekit_1-Tunelle.desktop'), `[Desktop Entry]\nExec=${appImage()} %U\n`);
    });

    it('reports it, so that nothing is offered', async () => {
      (await registerLauncherListeners())(undefined, appImage());
      const state = lastState();

      listeners.get('APP_READY')?.(event);

      await expect(state).resolves.toEqual({ available: true, enabled: false, offered: false, external: true });
    });

    it('adds no second entry when the user asks for one', async () => {
      (await registerLauncherListeners())(undefined, appImage());
      const state = lastState();

      listeners.get('SET_LAUNCHER')?.(event, { enabled: true });

      await expect(state).resolves.toEqual({ available: true, enabled: false, offered: true, external: true });
      await expect(stat(desktopFile())).rejects.toThrow();
    });

    it('still lets the user turn the own entry of the app off, and reports no other one while it is on', async () => {
      await writeFile(desktopFile(), `[Desktop Entry]\nExec="${join(home, 'data/tunelle/Tunelle.AppImage')}" %U\n`);
      (await registerLauncherListeners())(undefined, appImage());
      const state = lastState();

      listeners.get('APP_READY')?.(event);
      await expect(state).resolves.toMatchObject({ enabled: true, external: false });

      const off = lastState();
      listeners.get('SET_LAUNCHER')?.(event, { enabled: false });
      await expect(off).resolves.toMatchObject({ enabled: false, external: true });
    });
  });

  it.each([undefined, 'yes', {}, { enabled: 'yes' }])('ignores the request %j', async (payload) => {
    (await registerLauncherListeners())(undefined, appImage());

    listeners.get('SET_LAUNCHER')?.(event, payload);

    await expect(stat(join(home, 'userData/launcher-offered'))).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
