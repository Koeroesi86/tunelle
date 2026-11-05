import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import addFoldersToLibrary from './addFoldersToLibrary';
import pickFolders from './pickFolders';

vi.mock('./addFoldersToLibrary', () => ({ default: vi.fn() }));

describe('pickFolders', () => {
  const database = {} as Database;
  const sender = {} as WebContents;

  beforeEach(() => vi.mocked(addFoldersToLibrary).mockReset().mockResolvedValue(undefined));

  it('adds the picked folders like dropped ones', async () => {
    await pickFolders(database, sender, async () => ({ canceled: false, filePaths: ['/mnt/usb/music'] }));

    expect(addFoldersToLibrary).toHaveBeenCalledWith(database, [{ path: '/mnt/usb/music', lastModified: expect.any(Number) }], sender);
  });

  it('adds nothing when the dialog is canceled', async () => {
    await pickFolders(database, sender, async () => ({ canceled: true, filePaths: [] }));

    expect(addFoldersToLibrary).not.toHaveBeenCalled();
  });
});
