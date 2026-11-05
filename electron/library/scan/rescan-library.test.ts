import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { Folder } from '@shared/types/library';
import addTrack from './add-track';
import executeQuery from '../../database/execute-query';
import { getLibrary } from '../../repositories/library-repository';
import rescanLibrary from './rescan-library';
import scanFolders from './scan-folders';
import { createTestDatabase } from '../../test-database';

vi.mock('./scan-folders', () => ({ default: vi.fn() }));

describe('rescanLibrary', () => {
  let database: Database;
  let root: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const mtime = (folder: string) => Math.floor(fs.statSync(folder).mtimeMs);
  const storedFolders = () => executeQuery<Folder>(database, { query: 'SELECT * FROM folders ORDER BY path', variables: [] });
  const addFolder = (folder: string, lastModified: number) =>
    executeQuery(database, { query: 'INSERT INTO folders (path, lastModified) VALUES (?, ?)', variables: [folder, lastModified] });
  const rescan = (forced = false) => {
    const complete = new Promise<void>((resolve) => vi.mocked(sender.send).mockImplementation((channel) => channel === 'RESCAN_COMPLETE' && resolve()));
    rescanLibrary(sender, forced);
    return complete;
  };

  beforeEach(async () => {
    vi.mocked(scanFolders).mockReset().mockResolvedValue([]);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-rescan-'));
    database = await createTestDatabase();
    global._database = database;
  });

  afterEach(() => {
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('scans a folder that changed and stores its modification time afterwards', async () => {
    await addFolder(root, 0);
    await rescan();

    expect(scanFolders).toHaveBeenCalledWith([expect.objectContaining({ path: root })], sender);
    expect(await storedFolders()).toEqual([{ path: root, lastModified: mtime(root) }]);
  });

  it('keeps the old time of a folder that has files which did not answer, so the next scan looks at it again', async () => {
    await addFolder(root, 0);
    vi.mocked(scanFolders).mockResolvedValue([{ path: root }]);

    await rescan();

    expect(await storedFolders()).toEqual([{ path: root, lastModified: 0 }]);
  });

  it('does not store a folder again that was removed from the library during the scan', async () => {
    await addFolder(root, 0);
    vi.mocked(scanFolders).mockImplementation(async () => {
      await executeQuery(database, { query: 'DELETE FROM folders WHERE path = ?', variables: [root] });
      return [];
    });

    await rescan();

    expect(await storedFolders()).toEqual([]);
  });

  it('skips a folder that did not change', async () => {
    await addFolder(root, mtime(root));
    await rescan();

    expect(scanFolders).toHaveBeenCalledWith([], sender);
  });

  it('scans an unchanged folder when forced', async () => {
    await addFolder(root, mtime(root));
    await rescan(true);

    expect(scanFolders).toHaveBeenCalledWith([expect.objectContaining({ path: root })], sender);
  });

  it('keeps the old modification time when the scan fails, so the folder is retried', async () => {
    await addFolder(root, 0);
    vi.mocked(scanFolders).mockRejectedValue(new Error('scan failed'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rescanLibrary(sender, false);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());

    expect(await storedFolders()).toEqual([{ path: root, lastModified: 0 }]);
  });

  it('does not throw for a folder that was deleted', async () => {
    const gone = path.join(root, 'gone');
    await addFolder(gone, 0);
    await rescan();

    expect(scanFolders).toHaveBeenCalledWith([], sender);
  });

  const track = (trackPath: string) => ({
    path: trackPath,
    artist: '',
    album: '',
    title: '',
    year: '',
    track: '',
    disk: '',
    genre: '',
    picture: null,
    duration: null,
  });

  it('keeps the tracks of a folder that cannot be read, and scans nothing in it', async () => {
    const gone = path.join(root, 'usb');
    await addFolder(gone, 0);
    await addTrack(database, track(path.join(gone, 'a.flac')));
    await rescan(true);

    expect((await getLibrary(database, { sort: undefined, folders: [] }, ['path'])).map((item) => item.path)).toEqual([path.join(gone, 'a.flac')]);
    expect(scanFolders).toHaveBeenCalledWith([], sender);
    expect(sender.send).toHaveBeenCalledWith('OFFLINE_FOLDERS', { folders: [gone] });
  });

  it('keeps the tracks of an empty folder that the library has tracks in, like a mount point that is not mounted', async () => {
    await addFolder(root, 0);
    await addTrack(database, track(path.join(root, 'a.flac')));
    await rescan();

    expect(await getLibrary(database, { sort: undefined, folders: [] }, ['path'])).toHaveLength(1);
  });

  it('still removes the track that is missing from a folder that can be read', async () => {
    // the scan stores the paths of tracks with forward slashes, on every system
    const stored = (name: string) => path.join(root, name).replace(/\\/g, '/');
    fs.writeFileSync(path.join(root, 'kept.flac'), '');
    await addFolder(root, 0);
    await addTrack(database, track(stored('kept.flac')));
    await addTrack(database, track(stored('deleted.flac')));
    await rescan();

    expect((await getLibrary(database, { sort: undefined, folders: [] }, ['path'])).map((item) => item.path)).toEqual([stored('kept.flac')]);
  });

  it('removes the tracks of a format that is not supported, which an earlier version stored', async () => {
    const stored = (name: string) => path.join(root, name).replace(/\\/g, '/');
    ['kept.flac', 'old.wma', 'old.ape'].forEach((name) => fs.writeFileSync(path.join(root, name), ''));
    await addFolder(root, 0);
    await Promise.all(['kept.flac', 'old.wma', 'old.ape'].map((name) => addTrack(database, track(stored(name)))));
    await rescan();

    expect((await getLibrary(database, { sort: undefined, folders: [] }, ['path'])).map((item) => item.path)).toEqual([stored('kept.flac')]);
  });
});
