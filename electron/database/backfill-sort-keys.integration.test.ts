import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import backfillSortKeys from './backfill-sort-keys';
import executeQuery from './execute-query';
import { createTestDatabase } from '../test-database';

const insertWithoutKeys = (database: Database, path: string, title: string) =>
  executeQuery(database, { query: `INSERT INTO library (path, title, artist, album) VALUES (?, ?, 'Ártist', NULL)`, variables: [path, title] });

const keysOf = (database: Database) =>
  executeQuery<{ path: string; title_key: string; artist_key: string; album_key: string }>(database, {
    query: `SELECT path, title_key, artist_key, album_key FROM library ORDER BY path`,
    variables: [],
  });

describe('backfillSortKeys', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('fills the keys of the tracks from before the keys existed', async () => {
    await insertWithoutKeys(database, '/m/1', 'Ékes');
    await insertWithoutKeys(database, '/m/2', 'Zebra');

    await backfillSortKeys(database);

    expect(await keysOf(database)).toEqual([
      { path: '/m/1', title_key: 'ekes', artist_key: 'artist', album_key: '' },
      { path: '/m/2', title_key: 'zebra', artist_key: 'artist', album_key: '' },
    ]);
  });

  it('fills the genre key of the tracks from before it existed, and the album artist key from their album artist', async () => {
    await executeQuery(database, {
      query: `INSERT INTO library (path, genre, albumArtist, title_key, artist_key, album_key) VALUES ('/m/1', ' Électro ', 'Ékes', 't', 'a', 'b'), ('/m/2', NULL, NULL, 't', 'a', 'b')`,
      variables: [],
    });

    await backfillSortKeys(database);

    expect(await executeQuery(database, { query: `SELECT path, genre_key, album_artist_key FROM library ORDER BY path`, variables: [] })).toEqual([
      { path: '/m/1', genre_key: 'electro', album_artist_key: 'ekes' },
      { path: '/m/2', genre_key: '', album_artist_key: '' },
    ]);
  });

  it('leaves the tracks that have keys, and does nothing for an empty library', async () => {
    await backfillSortKeys(database);
    await executeQuery(database, {
      query: `INSERT INTO library (path, title_key, artist_key, album_key) VALUES ('/m/1', 'kept', 'kept', 'kept')`,
      variables: [],
    });

    await backfillSortKeys(database);

    expect(await keysOf(database)).toEqual([{ path: '/m/1', title_key: 'kept', artist_key: 'kept', album_key: 'kept' }]);
  });

  it('leaves every track as it was when one update fails', async () => {
    await insertWithoutKeys(database, '/m/1', 'Ékes');
    await insertWithoutKeys(database, '/m/2', 'Zebra');
    await executeQuery(database, {
      query: `CREATE TRIGGER fail_update BEFORE UPDATE ON library WHEN NEW.path = '/m/2' BEGIN SELECT RAISE(ABORT, 'failed'); END`,
      variables: [],
    });

    await expect(backfillSortKeys(database)).rejects.toBeDefined();

    expect((await keysOf(database)).map(({ title_key: titleKey }) => titleKey)).toEqual([null, null]);
  });
});
