import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import addTrack from './addTrack';
import executeQuery from './executeQuery';
import { getLibrary } from './repositories/libraryRepository';
import rescanChanges from './rescanChanges';
import scanFolder from './scanFolder';
import { createTestDatabase } from './test-database';

vi.mock('./scanFolder', () => ({ default: vi.fn() }));

describe('rescanChanges', () => {
  let database: Database;
  let root: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  // the scan stores the paths with forward slashes
  const stored = (...segments: string[]) => path.join(root, ...segments).replace(/\\/g, '/');
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
  const addFolder = (folder: string) => executeQuery(database, { query: 'INSERT INTO folders (path, lastModified) VALUES (?, ?)', variables: [folder, 0] });
  const paths = async () => (await getLibrary(database, { sort: undefined, folders: [] }, ['path'])).map((item) => item.path).sort();
  const write = (...segments: string[]) => {
    fs.mkdirSync(path.dirname(path.join(root, ...segments)), { recursive: true });
    fs.writeFileSync(path.join(root, ...segments), '');
  };

  beforeEach(async () => {
    vi.mocked(scanFolder).mockReset().mockResolvedValue(0);
    vi.mocked(sender.send).mockReset();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-changes-'));
    database = await createTestDatabase();
    global._database = database;
    write('kept.flac');
    write('rock', 'kept.flac');
    await addFolder(root);
  });

  afterEach(() => {
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('scans the places that changed, and not the library folder they are in', async () => {
    await rescanChanges(sender, [
      { path: path.join(root, 'rock'), deep: false },
      { path: path.join(root, 'jazz'), deep: true },
    ]);

    expect(scanFolder).toHaveBeenCalledExactlyOnceWith(path.join(root, 'rock'), sender, false);
    expect(sender.send).toHaveBeenCalledWith('RESCAN_COMPLETE', {});
  });

  it('removes the tracks that are gone from the places that changed, and leaves the others', async () => {
    await addTrack(database, track(stored('rock', 'kept.flac')));
    await addTrack(database, track(stored('rock', 'deleted.flac')));
    await addTrack(database, track(stored('deleted.flac')));
    await rescanChanges(sender, [{ path: path.join(root, 'rock'), deep: false }]);

    expect(await paths()).toEqual([stored('deleted.flac'), stored('rock', 'kept.flac')]);
  });

  it('removes what was below a folder that is gone, and what is directly in a shallow folder only', async () => {
    await addTrack(database, track(stored('old', 'disc', 'a.flac')));
    await addTrack(database, track(stored('rock', 'deleted.flac')));
    await addTrack(database, track(stored('rock', 'live', 'deleted.flac')));
    await rescanChanges(sender, [
      { path: path.join(root, 'old'), deep: true },
      { path: path.join(root, 'rock'), deep: false },
    ]);

    expect(await paths()).toEqual([stored('rock', 'live', 'deleted.flac')]);
  });

  it('keeps the tracks below a folder that is offline, and does not scan in it', async () => {
    const usb = path.join(root, 'usb');
    await addFolder(usb);
    await addTrack(database, track(stored('usb', 'a.flac')));
    await rescanChanges(sender, [{ path: usb, deep: true }]);

    expect(await paths()).toEqual([stored('usb', 'a.flac')]);
    expect(scanFolder).not.toHaveBeenCalled();
  });

  it('scans a folder once when a change in it is covered by a deep one', async () => {
    await rescanChanges(sender, [
      { path: path.join(root, 'rock'), deep: false },
      { path: root, deep: true },
    ]);

    expect(scanFolder).toHaveBeenCalledExactlyOnceWith(root, sender, true);
  });

  it('does not throw when the scan fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(scanFolder).mockRejectedValue(new Error('scan failed'));

    await expect(rescanChanges(sender, [{ path: path.join(root, 'rock'), deep: false }])).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
