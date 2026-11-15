import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import scanFolder from './scan-folder';
import { createTestDatabase } from '../../test-database';
import { getPlaylists } from '../../repositories/playlist-repository';
import normalizePath from '../../utils/normalize-path';

const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-playlists-'));

// the electron module is the only thing replaced: it says where the app is and where it may write, and its utility process reads the tags with the code of the worker
vi.mock('electron', async () => {
  const { EventEmitter } = await import('events');
  const { answer } = await import('../reading/track-reader-worker');
  class InProcessReader extends EventEmitter {
    postMessage = async (request: Parameters<typeof answer>[0]) => this.emit('message', await answer(request));
    kill = () => this.emit('exit', 0);
  }
  return { app: { isPackaged: false, getAppPath: () => path.join(root, 'out'), getPath: () => temp }, utilityProcess: { fork: () => new InProcessReader() } };
});

describe('scanning a folder with a playlist file in it', () => {
  let database: Database;
  let music: string;
  const send = vi.fn();
  const sender = { send, isDestroyed: () => false } as unknown as WebContents;
  const playlistFile = () => path.join(music, 'lists', 'mix.m3u');
  const inMusic = (name: string) => normalizePath(path.join(music, name));
  const sentPlaylists = () => send.mock.calls.filter(([channel]) => channel === 'PLAYLISTS').length;
  const titles = async () => (await getPlaylists(database)).flatMap(({ entries }) => entries.map(({ snapshot }) => (snapshot as { title: string }).title));

  beforeEach(async () => {
    send.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = temp;
    music = await fs.promises.mkdtemp(path.join(temp, 'music-'));
    await fs.promises.mkdir(path.join(music, 'lists'));
    await Promise.all(
      ['1-concert-a.mp3', '2-octave-up.mp3'].map((name) => fs.promises.copyFile(path.join(root, 'e2e', 'fixtures', 'mp3', name), path.join(music, name)))
    );
    await fs.promises.writeFile(playlistFile(), '../2-octave-up.mp3\n../gone.mp3\n../1-concert-a.mp3\n');
  });

  afterEach(async () => {
    global._database = undefined;
    await fs.promises.rm(music, { recursive: true, force: true });
  });

  it('makes a playlist of the file after the tracks are stored, so its entries are matched with them', async () => {
    await scanFolder(music, sender, true);

    const [playlist] = await getPlaylists(database);
    expect(playlist?.name).toBe('mix');
    expect(playlist?.entries.map(({ path: entryPath }) => entryPath)).toEqual([inMusic('2-octave-up.mp3'), inMusic('gone.mp3'), inMusic('1-concert-a.mp3')]);
    // the entries the library has hold its tags, the one it does not have is shown from the file name
    expect(await titles()).toEqual(['Octave Up', 'gone', 'Concert A']);
    expect(sentPlaylists()).toBe(1);
  });

  it('reads the file again only when it changed, and tells the window only then', async () => {
    await scanFolder(music, sender, true);
    await scanFolder(music, sender, true);
    expect(sentPlaylists()).toBe(1);

    await fs.promises.writeFile(playlistFile(), '../1-concert-a.mp3\n');
    await fs.promises.utimes(playlistFile(), new Date(), new Date(Date.now() + 5000));
    await scanFolder(music, sender, true);

    expect(await getPlaylists(database)).toHaveLength(1);
    expect(await titles()).toEqual(['Concert A']);
    expect(sentPlaylists()).toBe(2);
  });

  it('does not see a file below the folder in a scan that is not deep, and removes the playlist of a deleted file in the deep one', async () => {
    await scanFolder(music, sender, true);
    await fs.promises.rm(playlistFile());

    await scanFolder(music, sender, false);
    expect(await getPlaylists(database)).toHaveLength(1);

    await scanFolder(music, sender, true);
    expect(await getPlaylists(database)).toHaveLength(0);
    expect(sentPlaylists()).toBe(2);
  });

  it('makes a playlist of a file in the folder itself in a scan that is not deep, and removes it with the file', async () => {
    const own = path.join(music, 'own.m3u');
    await fs.promises.writeFile(own, '1-concert-a.mp3\n');

    await scanFolder(music, sender, false);
    expect((await getPlaylists(database)).map(({ name }) => name)).toEqual(['own']);

    await fs.promises.rm(own);
    await scanFolder(music, sender, false);
    expect(await getPlaylists(database)).toHaveLength(0);
  });

  it('leaves a playlist of a file in a folder that is not scanned alone', async () => {
    await scanFolder(music, sender, true);
    const other = await fs.promises.mkdtemp(path.join(temp, 'other-'));

    await scanFolder(other, sender, true);

    expect(await getPlaylists(database)).toHaveLength(1);
    await fs.promises.rm(other, { recursive: true, force: true });
  });
});
