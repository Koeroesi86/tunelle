// Needs the real files: the folder times that the file system keeps, as a look reads them from a tree
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createFolderWatcher, readDirectoryTimes } from './folder-watcher';

vi.mock('../../power/power-state', () => ({ savingPower: vi.fn(() => false) }));

describe('with the file system', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-watch-'));
    fs.mkdirSync(path.join(root, 'artist', 'album'), { recursive: true });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('reads the folder and the folders below it, and not the files', async () => {
    fs.writeFileSync(path.join(root, 'artist', 'album', 'one.flac'), '');

    expect([...(await readDirectoryTimes(root)).keys()].sort()).toEqual([root, path.join(root, 'artist'), path.join(root, 'artist', 'album')]);
  });

  it('finds a new file by the modification time of its folder', async () => {
    const album = path.join(root, 'artist', 'album');
    fs.utimesSync(album, 1, 1);
    const before = await readDirectoryTimes(root);
    fs.writeFileSync(path.join(album, 'new.flac'), '');

    expect((await readDirectoryTimes(root)).get(album)).not.toBe(before.get(album));
  });

  it('reads nothing of a folder that is not there', async () => {
    expect((await readDirectoryTimes(path.join(root, 'gone'))).size).toBe(0);
  });

  it('sees a file that is added below the folder', async () => {
    const onChange = vi.fn();
    const folderWatcher = createFolderWatcher(onChange, { interval: () => 20, checkGap: 0 });
    await folderWatcher.update([root]);

    // a file is written until a look sees it
    await vi.waitFor(() => {
      fs.writeFileSync(path.join(root, 'artist', 'album', `${Date.now()}.flac`), '');
      expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining(root) })]));
    });

    folderWatcher.close();
  });
});
