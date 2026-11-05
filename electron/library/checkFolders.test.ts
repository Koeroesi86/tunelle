import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import checkFolders from './checkFolders';
import { reportOfflineFolders } from './folderAvailability';
import { checkLibraryWatching, refreshLibraryWatching } from './libraryWatching';
import rescanLibrary from './rescanLibrary';

vi.mock('./folderAvailability', () => ({ reportOfflineFolders: vi.fn() }));
vi.mock('./rescanLibrary', () => ({ default: vi.fn() }));
vi.mock('./libraryWatching', () => ({ refreshLibraryWatching: vi.fn(), checkLibraryWatching: vi.fn() }));

describe('checkFolders', () => {
  const database = {} as Database;
  const sender = {} as WebContents;

  beforeEach(() => vi.mocked(rescanLibrary).mockReset());

  it('rescans when a folder came back', async () => {
    vi.mocked(reportOfflineFolders).mockResolvedValue({ offline: [], recovered: ['/mnt/usb'] });
    await checkFolders(database, sender);

    expect(rescanLibrary).toHaveBeenCalledWith(sender);
  });

  it('watches the folders that can be read, with the offline ones it has just found', async () => {
    vi.mocked(reportOfflineFolders).mockResolvedValue({ offline: ['/mnt/usb'], recovered: [] });
    await checkFolders(database, sender);

    expect(refreshLibraryWatching).toHaveBeenCalledWith(['/mnt/usb']);
  });

  it('looks at the watched folders for what the watch did not report', async () => {
    vi.mocked(reportOfflineFolders).mockResolvedValue({ offline: [], recovered: [] });
    await checkFolders(database, sender);

    expect(checkLibraryWatching).toHaveBeenCalledOnce();
  });

  it('does not rescan when nothing came back', async () => {
    vi.mocked(reportOfflineFolders).mockResolvedValue({ offline: ['/mnt/usb'], recovered: [] });
    await checkFolders(database, sender);

    expect(rescanLibrary).not.toHaveBeenCalled();
  });
});
