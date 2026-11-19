import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import addFoldersToLibrary from '../library/scan/add-folders-to-library';
import pickFolders from './pick-folders';
import { fakeDatabase } from '../test-fake-database';

vi.mock('../library/scan/add-folders-to-library', () => ({ default: vi.fn() }));

describe('pickFolders', () => {
  const database = fakeDatabase();
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
