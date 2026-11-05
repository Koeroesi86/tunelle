import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { parseFile } from 'music-metadata';
import scanFolder from './scanFolder';
import executeQuery from '../database/executeQuery';
import { createTestDatabase } from '../test-database';

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

const meta = (common: object) => ({ common: { artist: 'Artist', album: 'Album', title: 'Title', ...common }, format: { duration: 60 }, native: {} });

describe('scanFolder album artist and genre', () => {
  let database: Database;
  let root: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const stored = () =>
    executeQuery<Record<string, unknown>>(database, { query: 'SELECT albumArtist, album_artist_key, genre, genre_key FROM library', variables: [] });
  const parsed = vi.mocked(parseFile);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-browse-'));
    fs.writeFileSync(path.join(root, 'a.flac'), 'not audio');
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = root;
  });

  afterEach(() => {
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
    parsed.mockReset();
  });

  it('stores the album artist and the genre of a file with the keys the library is browsed by', async () => {
    parsed.mockResolvedValue(meta({ albumartist: 'Björk ', genre: ['Électro', 'Pop'] }) as never);

    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ albumArtist: 'Björk ', album_artist_key: 'bjork', genre: 'Électro', genre_key: 'electro' }]);
  });

  it('stores a file without them as empty', async () => {
    parsed.mockResolvedValue(meta({}) as never);

    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ albumArtist: '', album_artist_key: '', genre: '', genre_key: '' }]);
  });

  it('fills in a row that was stored before the album artist was read', async () => {
    await executeQuery(database, {
      query: `INSERT INTO library (path, artist, album, title, year, track, disk, genre, duration) VALUES (?, 'Artist', 'Album', 'Title', '', '', '', '', 60)`,
      variables: [path.join(root, 'a.flac').replace(/\\/g, '/')],
    });
    parsed.mockResolvedValue(meta({ albumartist: 'Various' }) as never);

    await scanFolder(root, sender);

    expect(await stored()).toEqual([expect.objectContaining({ albumArtist: 'Various', album_artist_key: 'various' })]);
  });
});
