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
import { backgroundQueue } from '../tasks/background-queue';
import type { Task } from '../tasks/task-queue';

vi.mock('./scan-folders', () => ({ default: vi.fn() }));
// the queue is the one of the app: the scans are put on it, and the test runs what was put on it, so no queue runs and nothing waits
vi.mock('../tasks/background-queue', () => ({ scanKind: 'scan', backgroundQueue: { enqueue: vi.fn() } }));

describe('rescanLibrary', () => {
  let database: Database;
  let root: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const mtime = (folder: string) => Math.floor(fs.statSync(folder).mtimeMs);
  const storedFolders = () => executeQuery<Folder>(database, { query: 'SELECT * FROM folders ORDER BY path', variables: [] });
  const addFolder = (folder: string, lastModified: number) =>
    executeQuery(database, { query: 'INSERT INTO folders (path, lastModified) VALUES (?, ?)', variables: [folder, lastModified] });
  const queued = () => vi.mocked(backgroundQueue.enqueue).mock.calls.map(([task]): Task => task);
  /** Runs the scans that were put on the queue, as the queue would, and answers when they are over */
  const runQueued = async () => {
    const tasks = queued();
    vi.mocked(backgroundQueue.enqueue).mockClear();
    await Promise.all(tasks.map((task) => task.run(new AbortController().signal)));
  };
  const rescan = async (forced = false) => {
    const done = rescanLibrary(sender, forced);
    await runQueued();
    await done;
  };

  beforeEach(async () => {
    vi.mocked(backgroundQueue.enqueue).mockReset();
    vi.mocked(sender.send).mockReset();
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

  it('puts the scan on the background queue before any other work, and does not run it before the queue does', async () => {
    await addFolder(root, 0);

    const done = rescanLibrary(sender, false);

    expect(queued()).toEqual([expect.objectContaining({ kind: 'scan', key: 'rescan-library', priority: 10 })]);
    expect(scanFolders).not.toHaveBeenCalled();
    await runQueued();
    await done;
    expect(scanFolders).toHaveBeenCalledTimes(1);
  });

  it('scans once for the callers that wait, completely when one of them asked for it', async () => {
    await addFolder(root, mtime(root));

    const callers = Promise.all([rescanLibrary(sender, false), rescanLibrary(sender, true)]);
    expect(queued()).toHaveLength(1);
    await runQueued();
    await callers;

    expect(scanFolders).toHaveBeenCalledOnce();
    expect(scanFolders).toHaveBeenCalledWith([expect.objectContaining({ path: root })], sender);
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
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await rescan();

    expect(error).toHaveBeenCalled();
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

    expect((await getLibrary(database, { sort: undefined, folders: [] })).map((item) => item.path)).toEqual([path.join(gone, 'a.flac')]);
    expect(scanFolders).toHaveBeenCalledWith([], sender);
    expect(sender.send).toHaveBeenCalledWith('OFFLINE_FOLDERS', { folders: [gone] });
  });

  it('keeps the tracks of an empty folder that the library has tracks in, like a mount point that is not mounted', async () => {
    await addFolder(root, 0);
    await addTrack(database, track(path.join(root, 'a.flac')));
    await rescan();

    expect(await getLibrary(database, { sort: undefined, folders: [] })).toHaveLength(1);
  });

  it('still removes the track that is missing from a folder that can be read', async () => {
    // the scan stores the paths of tracks with forward slashes, on every system
    const stored = (name: string) => path.join(root, name).replace(/\\/g, '/');
    fs.writeFileSync(path.join(root, 'kept.flac'), '');
    await addFolder(root, 0);
    await addTrack(database, track(stored('kept.flac')));
    await addTrack(database, track(stored('deleted.flac')));
    await rescan();

    expect((await getLibrary(database, { sort: undefined, folders: [] })).map((item) => item.path)).toEqual([stored('kept.flac')]);
  });

  it('removes the tracks of a format or codec that is not supported, which an earlier version stored', async () => {
    const stored = (name: string) => path.join(root, name).replace(/\\/g, '/');
    ['kept.flac', 'old.wma', 'old.mp2', 'ac3.m4a'].forEach((name) => fs.writeFileSync(path.join(root, name), ''));
    await addFolder(root, 0);
    await Promise.all(['kept.flac', 'old.wma', 'old.mp2'].map((name) => addTrack(database, track(stored(name)))));
    await addTrack(database, { ...track(stored('ac3.m4a')), codec: 'AC-3' });
    await rescan();

    expect((await getLibrary(database, { sort: undefined, folders: [] })).map((item) => item.path)).toEqual([stored('kept.flac')]);
  });
});
