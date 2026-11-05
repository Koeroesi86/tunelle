import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listenerContext';
import registerStateListeners from './registerStateListeners';
import { folderColumns } from '../constants/library';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();
const nativeTheme = vi.hoisted(() => ({ themeSource: 'system' }));

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
  nativeTheme,
}));

const watching = vi.hoisted(() => ({ startLibraryWatching: vi.fn(async () => undefined), applyWatchSetting: vi.fn(async () => undefined) }));

vi.mock('../library/libraryWatching', () => watching);

vi.mock('../repositories/libraryRepository', () => ({ folderColumns: ['path', 'lastModified'], getFolders: async () => ['/music'] }));

const saveSettings = vi.fn(async () => undefined);

vi.mock('../repositories/settingsRepository', () => ({
  getSettings: async () => ({ volume: 1 }),
  saveSettings: () => saveSettings(),
}));

describe('registerStateListeners', () => {
  const context = { database: {} } as ListenerContext;
  const send = vi.fn();
  const destroyedSender = { send, isDestroyed: () => true };

  beforeEach(() => {
    listeners.clear();
    send.mockReset();
    nativeTheme.themeSource = 'system';
    registerStateListeners(context);
  });

  it('sends the folders and the settings to the window that is ready', async () => {
    const done = new Promise((resolve) => send.mockImplementation((channel) => channel === 'RESTORE_SETTINGS' && resolve(undefined)));

    listeners.get('APP_READY')?.({ sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent);
    await done;

    expect(send).toHaveBeenCalledWith('STORE_FOLDERS', { folders: ['/music'] });
    expect(send).toHaveBeenCalledWith('RESTORE_SETTINGS', { settings: { volume: 1 } });
  });

  it('starts watching the library for the window that is ready', async () => {
    const sender = { send, isDestroyed: () => false };

    listeners.get('APP_READY')?.({ sender } as unknown as IpcMainEvent);

    expect(watching.startLibraryWatching).toHaveBeenCalledWith(context.database, sender);
  });

  it('gives the saved settings to the watching of the library', async () => {
    listeners.get('SAVE_SETTINGS')?.({ sender: destroyedSender } as unknown as IpcMainEvent, { watchFolders: false });

    expect(watching.applyWatchSetting).toHaveBeenCalledWith({ watchFolders: false });
  });

  it('does not send to a window that was closed while the settings were saved', async () => {
    listeners.get('SAVE_SETTINGS')?.({ sender: destroyedSender } as unknown as IpcMainEvent, {});
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());
    await saveSettings.mock.results[0].value;

    expect(send).not.toHaveBeenCalled();
  });

  it('matches the native theme to the mode of the saved settings', async () => {
    listeners.get('SAVE_SETTINGS')?.({ sender: destroyedSender } as unknown as IpcMainEvent, { theme: { mode: 'light' } });
    expect(nativeTheme.themeSource).toBe('light');

    listeners.get('SAVE_SETTINGS')?.({ sender: destroyedSender } as unknown as IpcMainEvent, { theme: { mode: 'system' } });
    expect(nativeTheme.themeSource).toBe('system');
  });
});
