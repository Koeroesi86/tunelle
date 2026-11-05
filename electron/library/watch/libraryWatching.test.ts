import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { applyWatchSetting, checkLibraryWatching, refreshLibraryWatching, startLibraryWatching } from './libraryWatching';
import { findOfflineFolders } from './folderAvailability';
import { getFolders } from '../../repositories/libraryRepository';
import { getSettings } from '../../repositories/settingsRepository';
import rescanChanges from '../scan/rescanChanges';
import rescanLibrary from '../scan/rescanLibrary';

const folderWatcher = vi.hoisted(() => ({
  update: vi.fn(async () => undefined),
  check: vi.fn(async () => undefined),
  close: vi.fn(),
  onChange: undefined as ((changes: { path: string; deep: boolean }[]) => void) | undefined,
}));

vi.mock('./folderWatcher', () => ({
  createFolderWatcher: (onChange: (changes: { path: string; deep: boolean }[]) => void) => {
    folderWatcher.onChange = onChange;
    return folderWatcher;
  },
}));
vi.mock('./folderAvailability', () => ({ findOfflineFolders: vi.fn() }));
vi.mock('../../repositories/libraryRepository', () => ({ getFolders: vi.fn() }));
vi.mock('../../repositories/settingsRepository', () => ({ getSettings: vi.fn() }));
vi.mock('../scan/rescanLibrary', () => ({ default: vi.fn() }));
vi.mock('../scan/rescanChanges', () => ({ default: vi.fn() }));

describe('libraryWatching', () => {
  const database = {} as Database;
  const handlers = new Map<string, () => void>();
  const sender = { once: (event: string, handler: () => void) => handlers.set(event, handler) } as unknown as WebContents;
  const folders = ['/music', '/usb'].map((path) => ({ path, lastModified: 0 }));

  beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
    folderWatcher.update.mockReset().mockResolvedValue(undefined);
    folderWatcher.check.mockReset().mockResolvedValue(undefined);
    folderWatcher.close.mockReset();
    vi.mocked(rescanLibrary).mockReset().mockResolvedValue(undefined);
    vi.mocked(rescanChanges).mockReset().mockResolvedValue(undefined);
    vi.mocked(getFolders).mockResolvedValue(folders);
    vi.mocked(findOfflineFolders).mockResolvedValue(['/usb']);
    vi.mocked(getSettings).mockResolvedValue({ volume: 1 });
  });

  afterEach(async () => {
    handlers.get('destroyed')?.();
    vi.useRealTimers();
  });

  it('scans the library at start, and watches the folders that can be read', async () => {
    await startLibraryWatching(database, sender);

    expect(rescanLibrary).toHaveBeenCalledExactlyOnceWith(sender);
    expect(folderWatcher.update).toHaveBeenLastCalledWith(['/music']);
  });

  it('scans what changed once it is quiet, and not the library', async () => {
    await startLibraryWatching(database, sender);
    vi.mocked(rescanLibrary).mockClear();

    folderWatcher.onChange?.([{ path: '/music/rock', deep: false }]);
    folderWatcher.onChange?.([{ path: '/music/rock', deep: false }]);
    await vi.advanceTimersByTimeAsync(2000);

    expect(rescanChanges).toHaveBeenCalledExactlyOnceWith(sender, [{ path: '/music/rock', deep: false }]);
    expect(rescanLibrary).not.toHaveBeenCalled();
  });

  it('watches nothing when it was saved off, and still scans at start', async () => {
    vi.mocked(getSettings).mockResolvedValue({ watchFolders: false });
    await startLibraryWatching(database, sender);

    expect(rescanLibrary).toHaveBeenCalledOnce();
    expect(folderWatcher.update).toHaveBeenLastCalledWith([]);
  });

  it('follows the setting while the app runs, and only when it changed', async () => {
    await startLibraryWatching(database, sender);
    folderWatcher.update.mockClear();

    await applyWatchSetting({ volume: 1 });
    expect(folderWatcher.update).not.toHaveBeenCalled();

    await applyWatchSetting({ watchFolders: false });
    expect(folderWatcher.update).toHaveBeenLastCalledWith([]);

    await applyWatchSetting({ watchFolders: true });
    expect(folderWatcher.update).toHaveBeenLastCalledWith(['/music']);
  });

  it('uses the offline folders it is given, without looking at the folders again', async () => {
    await startLibraryWatching(database, sender);
    vi.mocked(findOfflineFolders).mockClear();

    await refreshLibraryWatching([]);

    expect(findOfflineFolders).not.toHaveBeenCalled();
    expect(folderWatcher.update).toHaveBeenLastCalledWith(['/music', '/usb']);
  });

  it('looks at the folders when asked, and does nothing before there is a window', async () => {
    await checkLibraryWatching();
    expect(folderWatcher.check).not.toHaveBeenCalled();

    await startLibraryWatching(database, sender);
    await checkLibraryWatching();

    expect(folderWatcher.check).toHaveBeenCalledOnce();
  });

  it('stops when the window is gone, and does nothing before there is one', async () => {
    await startLibraryWatching(database, sender);
    handlers.get('destroyed')?.();
    folderWatcher.update.mockClear();

    await refreshLibraryWatching();

    expect(folderWatcher.close).toHaveBeenCalled();
    expect(folderWatcher.update).not.toHaveBeenCalled();
  });
});
