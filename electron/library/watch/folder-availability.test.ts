import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import addTrack from '../scan/add-track';
import { findOfflineFolders, isDirectlyInside, isInsideFolder, reportOfflineFolders } from './folder-availability';
import { mountGuard } from '../mounts/mount-guard';
import { createTestDatabase } from '../../test-database';

describe('folderAvailability', () => {
  let database: Database;
  let root: string;
  const folder = (folderPath: string) => ({ path: folderPath, lastModified: 0 });
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

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-folders-'));
    database = await createTestDatabase();
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('takes a folder that is missing as offline', async () => {
    expect(await findOfflineFolders(database, [folder(path.join(root, 'gone'))])).toEqual([path.join(root, 'gone')]);
  });

  it('takes a folder with files as online', async () => {
    fs.writeFileSync(path.join(root, 'a.flac'), '');

    expect(await findOfflineFolders(database, [folder(root)])).toEqual([]);
  });

  it('takes an empty folder as online while the library has no tracks in it', async () => {
    expect(await findOfflineFolders(database, [folder(root)])).toEqual([]);
  });

  it('takes an empty folder as offline when the library has tracks in it, as the mount point of a drive that is gone is', async () => {
    await addTrack(database, track(path.join(root, 'a.flac')));

    expect(await findOfflineFolders(database, [folder(root)])).toEqual([root]);
  });

  it('asks the process of the mount and not the main process, so a folder that does not answer holds no thread of it', async () => {
    const opendir = vi.spyOn(fs.promises, 'opendir');
    const isEmpty = vi.spyOn(mountGuard(), 'isEmpty').mockResolvedValue(undefined);

    expect(await findOfflineFolders(database, [folder(root)])).toEqual([root]);
    expect(isEmpty).toHaveBeenCalledWith(root, root);
    expect(opendir).toHaveBeenCalledTimes(0);
    vi.restoreAllMocks();
  });

  it('reports the folders that came back since the last report', async () => {
    const sender = { send: vi.fn() } as unknown as WebContents;
    const gone = folder(path.join(root, 'gone'));
    await reportOfflineFolders(database, sender, [gone]);
    fs.mkdirSync(gone.path);
    fs.writeFileSync(path.join(gone.path, 'a.flac'), '');
    const { recovered } = await reportOfflineFolders(database, sender, [gone]);

    expect(recovered).toEqual([gone.path]);
    expect(sender.send).toHaveBeenLastCalledWith('OFFLINE_FOLDERS', { folders: [] });
  });

  it('finds a file inside a folder but not in a sibling with the same beginning', () => {
    expect(isInsideFolder(path.join(path.sep, 'mnt', 'usb'), path.join(path.sep, 'mnt', 'usb', 'a.flac'))).toBe(true);
    expect(isInsideFolder(path.join(path.sep, 'mnt', 'usb'), path.join(path.sep, 'mnt', 'usb2', 'a.flac'))).toBe(false);
  });

  it('tells a file in a folder from one in a folder below it', () => {
    expect(isDirectlyInside('C:\\Music\\Rock', 'C:/Music/Rock/a.flac')).toBe(true);
    expect(isDirectlyInside('C:\\Music\\Rock\\', 'C:/Music/Rock/a.flac')).toBe(true);
    expect(isDirectlyInside('C:\\Music\\Rock', 'C:/Music/Rock/live/a.flac')).toBe(false);
    expect(isDirectlyInside('C:\\Music\\Rock', 'C:/Music/Rock2/a.flac')).toBe(false);
  });

  it('finds a track of a folder that was picked with backslashes, as the scan stores it with forward slashes', () => {
    expect(isInsideFolder('C:\\Music\\Rock', 'C:/Music/Rock/a.flac')).toBe(true);
    expect(isInsideFolder('C:\\Music\\Rock\\', 'C:/Music/Rock/live/a.flac')).toBe(true);
    expect(isInsideFolder('C:\\Music\\Rock', 'C:/Music/Rock2/a.flac')).toBe(false);
  });
});
