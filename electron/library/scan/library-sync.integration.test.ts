// Needs the real database and files: the scan, the queue and SQLite following changes of the disk
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { z } from 'zod';
import { albums, writeTrack } from '../../../e2e/support/library';
import closeDatabase from '../../database/close-database';
import executeQuery from '../../database/execute-query';
import { createTestDatabase } from '../../test-database';
import { backgroundQueue } from '../tasks/background-queue';
import addFoldersToLibrary from './add-folders-to-library';
import checkFolders from './check-folders';
import removeFolderFromLibrary from './remove-folder-from-library';
import rescanChanges from './rescan-changes';
import rescanLibrary from './rescan-library';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-library-sync-'));

// the electron module is the only thing replaced: its utility processes run the code of their workers in this process, the reader of the tags and the one that looks at a folder
vi.mock('electron', async () => {
  const { EventEmitter } = await import('events');
  const { answer } = await import('../reading/track-reader-worker');
  const { answerProbe } = await import('../mounts/mount-probe-worker');
  class InProcessWorker extends EventEmitter {
    constructor(private readonly respond: (request: never) => Promise<unknown>) {
      super();
    }
    postMessage = async (request: never) => this.emit('message', await this.respond(request));
    kill = () => this.emit('exit', 0);
  }
  return {
    app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => temp },
    utilityProcess: {
      fork: (script: string) => new InProcessWorker(script.includes('mount-probe-worker') ? answerProbe : answer),
    },
  };
});

const trackSchema = z.object({ title: z.string() });
const offlineSchema = z.object({ folders: z.array(z.string()) });

describe('the library of a folder that changes on the disk', () => {
  let database: Database;
  let music: string;
  const send = vi.fn();
  const sender = { send, isDestroyed: () => false, once: vi.fn() } as unknown as WebContents;
  const album = () => path.join(music, 'pitch-perfect');
  const titles = async () =>
    (await executeQuery(database, { query: 'SELECT title FROM library ORDER BY title', variables: [] }, trackSchema)).map(({ title }) => title);
  const lastOffline = () => offlineSchema.parse(send.mock.calls.filter(([channel]) => channel === 'OFFLINE_FOLDERS').at(-1)?.[1]).folders;
  const rescan = () => rescanLibrary(sender, true);

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global._appDataPath = temp;
    backgroundQueue.start();
  });

  afterAll(async () => {
    await backgroundQueue.stop();
    global._database = undefined;
    fs.rmSync(temp, { recursive: true, force: true });
  });

  afterEach(() => closeDatabase(database));

  beforeEach(async () => {
    send.mockClear();
    database = await createTestDatabase();
    global._database = database;
    music = fs.mkdtempSync(path.join(temp, 'music-'));
    [0, 1, 2].forEach((index) => writeTrack(album(), albums[0], index, 1));
    writeTrack(path.join(music, 'single-note'), albums[1], 0, 1);
    await addFoldersToLibrary(database, [{ path: music, lastModified: 0 }], sender);
  });

  it('stores the tracks of the folder that was added', async () => {
    expect(await titles()).toEqual(['Concert A', 'Deep Bass', 'Hold It', 'Octave Up']);
  });

  it('picks up a file that was added to the folder with a rescan', async () => {
    writeTrack(path.join(music, 'single-note'), { ...albums[1], tracks: [...albums[1].tracks, { title: 'Second Note', frequency: 220 }] }, 1, 1);

    await rescan();

    expect(await titles()).toContain('Second Note');
    expect(await titles()).toHaveLength(5);
  });

  it('rescans a file whose size changed, and skips one whose size and modification time are the same', async () => {
    const skipped = path.join(album(), '1-concert-a.flac');
    const modified = fs.statSync(skipped).mtimeMs;
    // a tag of the same length keeps the size; the time is the one of the file at the first scan, to the millisecond
    writeTrack(album(), albums[0], 0, 1, { TITLE: 'Concert Z' });
    fs.utimesSync(skipped, (Math.floor(modified) + 0.5) / 1000, (Math.floor(modified) + 0.5) / 1000);
    writeTrack(album(), albums[0], 1, 1, { TITLE: 'Octave Down!' });

    await rescan();

    expect(await titles()).toEqual(['Concert A', 'Deep Bass', 'Hold It', 'Octave Down!']);
  });

  it('rescans a file whose modification time changed, also with the same size', async () => {
    const file = path.join(album(), '1-concert-a.flac');
    writeTrack(album(), albums[0], 0, 1, { TITLE: 'Concert Z' });
    const later = new Date(fs.statSync(file).mtimeMs + 60_000);
    fs.utimesSync(file, later, later);

    await rescan();

    expect(await titles()).toEqual(['Concert Z', 'Deep Bass', 'Hold It', 'Octave Up']);
  });

  it('picks up the files that were added to and removed from a folder, as the watch reports them', async () => {
    const fresh = path.join(music, 'fresh-start', 'disc-1');
    writeTrack(fresh, { ...albums[1], title: 'Fresh Start', tracks: [{ title: 'New Note', frequency: 330 }] }, 0, 1);

    await rescanChanges(sender, [{ path: music, deep: true }]);
    expect(await titles()).toContain('New Note');

    fs.rmSync(path.join(music, 'fresh-start'), { recursive: true });
    await rescanChanges(sender, [{ path: music, deep: true }]);
    expect(await titles()).toEqual(['Concert A', 'Deep Bass', 'Hold It', 'Octave Up']);
  });

  it('removes a folder from the library and leaves its files', async () => {
    await removeFolderFromLibrary(database, music, sender);

    expect(await titles()).toEqual([]);
    expect(fs.readdirSync(album())).toHaveLength(3);
    expect(send).toHaveBeenCalledWith('STORE_FOLDERS', { folders: [] });
  });

  it('marks a folder that cannot be reached and keeps its tracks, and finds them again once it is back', async () => {
    const away = `${music}-away`;
    fs.renameSync(music, away);

    await checkFolders(database, sender);
    expect(lastOffline()).toEqual([music]);
    await rescan();
    expect(await titles()).toHaveLength(4);

    fs.renameSync(away, music);
    await checkFolders(database, sender);

    expect(lastOffline()).toEqual([]);
    expect(await titles()).toHaveLength(4);
  });
});
