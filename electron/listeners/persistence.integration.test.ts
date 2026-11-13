import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { IpcMainEvent, WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { z } from 'zod';
import closeDatabase from '../database/close-database';
import executeQuery from '../database/execute-query';
import scanFolder from '../library/scan/scan-folder';
import { createTestDatabase } from '../test-database';
import type { ListenerContext } from './listener-context';
import registerFavouriteListeners from './register-favourite-listeners';
import registerHistoryListeners from './register-history-listeners';
import registerPlaylistListeners from './register-playlist-listeners';
import registerStateListeners from './register-state-listeners';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-persistence-'));
const file = path.join(temp, 'library.sqlite');

// the electron module is the only thing replaced: the channels the listeners answer on, the theme and language they set, and the reader of the tags
vi.mock('electron', async () => {
  const { EventEmitter } = await import('events');
  const { answer } = await import('../library/reading/track-reader-worker');
  class InProcessReader extends EventEmitter {
    postMessage = async (request: Parameters<typeof answer>[0]) => this.emit('message', await answer(request));
    kill = () => this.emit('exit', 0);
  }
  return {
    ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
    app: { getLocale: () => 'en-US' },
    nativeTheme: {},
    utilityProcess: { fork: () => new InProcessReader() },
  };
});

const libraryTrackSchema = z.object({ path: z.string(), title: z.string(), artist: z.string(), album: z.string() });

/** The app ending and starting again on the same file: the database is closed and opened again, and the listeners are registered on the new one */
const start = async (database?: Database) => {
  if (database) await closeDatabase(database);
  const opened = await createTestDatabase(file);
  const sent: { channel: string; payload: unknown }[] = [];
  const sender = { send: (channel: string, payload: unknown) => sent.push({ channel, payload }), isDestroyed: () => false } as unknown as WebContents;
  const loudness = { checkSetting: async () => undefined } as unknown as ListenerContext['loudness'];
  const context = { database: opened, radio: { findStations: async () => [] }, loudness } as unknown as ListenerContext;

  listeners.clear();
  [registerFavouriteListeners, registerHistoryListeners, registerPlaylistListeners, registerStateListeners].forEach((register) => register(context));

  /** What the window sends, and what the main process sends back on the channel of the answer */
  const ask = async (channel: string, reply: string, payload?: unknown) => {
    const before = sent.filter((message) => message.channel === reply).length;
    listeners.get(channel)?.({ sender } as unknown as IpcMainEvent, payload);
    // the default of 1 s is short for a real database on a slow runner, see docs/development/integration-tests.md
    await vi.waitFor(() => expect(sent.filter((message) => message.channel === reply).length).toBeGreaterThan(before), { timeout: 15_000 });
    return sent.filter((message) => message.channel === reply).at(-1)?.payload;
  };

  return { database: opened, ask };
};

describe('what the listener builds up in the app is there after it starts again', () => {
  let current: Database | undefined;
  const tracks: z.infer<typeof libraryTrackSchema>[] = [];

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { database } = await start();
    global._database = database;
    global._appDataPath = temp;
    await scanFolder(path.join(root, 'e2e', 'fixtures', 'mp3'), { send: vi.fn() } as unknown as WebContents);
    tracks.push(
      ...(await executeQuery(database, { query: 'SELECT path, title, artist, album FROM library ORDER BY path', variables: [] }, libraryTrackSchema))
    );
    current = database;
  });

  afterAll(async () => {
    global._database = undefined;
    if (current) await closeDatabase(current);
    fs.rmSync(temp, { recursive: true, force: true });
  });

  /** The app as it is now, started on the file that the earlier tests wrote */
  const app = async () => {
    const started = await start(current);
    current = started.database;
    return started.ask;
  };

  it('keeps a playlist of an album with its tracks', async () => {
    const before = await app();
    await before('PLAYLIST_CREATE', 'PLAYLISTS', { name: 'Evening', tracks });

    const after = await app();
    const answer = z.object({
      playlists: z.array(z.object({ name: z.string(), entries: z.array(z.object({ available: z.boolean(), track: z.object({ title: z.string() }) })) })),
    });
    const { playlists } = answer.parse(await after('PLAYLISTS_LOAD', 'PLAYLISTS'));

    expect(tracks.length).toBeGreaterThan(1);
    expect(playlists.map(({ name }) => name)).toEqual(['Evening']);
    expect(playlists[0].entries.map(({ track }) => track.title)).toEqual(tracks.map(({ title }) => title));
    expect(playlists[0].entries.every(({ available }) => available)).toBe(true);
  });

  it('keeps a liked album, and forgets it once it is not liked any more', async () => {
    const snapshot = { path: path.dirname(tracks[0].path), title: tracks[0].album, artist: tracks[0].artist };
    const key = { source: 'local', kind: 'album', id: `${snapshot.artist}/${snapshot.title}` };
    const before = await app();
    await before('FAVOURITE_ADD', 'FAVOURITES', { ...key, snapshot });

    const after = await app();
    const liked = z.object({ favourites: z.array(z.object({ id: z.string() })) }).parse(await after('FAVOURITES_LOAD', 'FAVOURITES'));
    expect(liked.favourites.map(({ id }) => id)).toEqual([key.id]);

    const removed = z.object({ favourites: z.array(z.unknown()) }).parse(await after('FAVOURITE_REMOVE', 'FAVOURITES', key));
    expect(removed.favourites).toEqual([]);
  });

  it('keeps what was played in the history, and clears it', async () => {
    const [track] = tracks;
    const key = { source: 'local', kind: 'track', id: track.path };
    const before = await app();
    await before('HISTORY_RECORD', 'HISTORY', { ...key, snapshot: track });

    const after = await app();
    const history = z.object({ history: z.array(z.object({ id: z.string() })) }).parse(await after('HISTORY_LOAD', 'HISTORY'));
    expect(history.history.map(({ id }) => id)).toEqual([track.path]);

    const cleared = z.object({ history: z.array(z.unknown()) }).parse(await after('HISTORY_CLEAR', 'HISTORY'));
    expect(cleared.history).toEqual([]);
  });

  it('keeps the settings: the gains of the equalizer and the language', async () => {
    const settings = { language: 'hu', equalizer: [-2, 0, 2, 4, 3, 0, -1, -2, -3, -4] };
    const before = await app();
    await before('SAVE_SETTINGS', 'SETTINGS_SAVED', settings);

    const after = await app();
    expect(await after('APP_READY', 'RESTORE_SETTINGS')).toEqual({ settings });
  });
});
