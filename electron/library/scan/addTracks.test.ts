import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import { addTracks, maxBatchSize, readBatchSize } from './addTracks';
import executeQuery from '../../database/executeQuery';
import { createTestDatabase } from '../../test-database';

const trackAt = (index: number): Track => ({
  path: `/music/${index}.flac`,
  artist: 'Artist',
  album: 'Album',
  title: `Title ${index}`,
  year: 2020,
  track: index,
  disk: 1,
  genre: 'Rock',
  picture: null,
  duration: 10,
});

const paths = (database: Database) => executeQuery<{ path: string }>(database, { query: 'SELECT path FROM library ORDER BY track', variables: [] });

describe('addTracks', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(() => {
    database.close(() => undefined);
  });

  it('updates a stored track in place and keeps a column the scan does not write', async () => {
    await executeQuery(database, { query: 'ALTER TABLE library ADD COLUMN playCount INTEGER NOT NULL DEFAULT 0', variables: [] });
    await addTracks(database, [trackAt(1)]);
    await executeQuery(database, { query: 'UPDATE library SET playCount = 7', variables: [] });

    await addTracks(database, [{ ...trackAt(1), title: 'Renamed' }]);

    expect(await executeQuery(database, { query: 'SELECT title, playCount FROM library', variables: [] })).toEqual([{ title: 'Renamed', playCount: 7 }]);
  });

  it('stores a full statement of tracks at once', async () => {
    await addTracks(
      database,
      Array.from({ length: maxBatchSize }, (_, index) => trackAt(index))
    );

    expect(await paths(database)).toHaveLength(maxBatchSize);
  });

  it('replaces a track that is stored already', async () => {
    await addTracks(database, [trackAt(1), trackAt(2)]);
    await addTracks(database, [{ ...trackAt(2), title: 'Changed' }, trackAt(3)]);

    const rows = await executeQuery<{ title: string }>(database, { query: 'SELECT title FROM library ORDER BY track', variables: [] });
    expect(rows.map((row) => row.title)).toEqual(['Title 1', 'Changed', 'Title 3']);
  });

  it('fails when the database does not take the tracks', async () => {
    await new Promise((resolve) => database.close(resolve));

    await expect(addTracks(database, [trackAt(1)])).rejects.toBeDefined();
  });

  it('does nothing for no tracks', async () => {
    await expect(addTracks(database, [])).resolves.toBeUndefined();
  });
});

describe('readBatchSize', () => {
  it.each([
    ['25', 25],
    ['1', 1],
    [String(maxBatchSize), maxBatchSize],
  ])('takes %s', (value, expected) => {
    expect(readBatchSize(value)).toBe(expected);
  });

  it.each([undefined, '', '0', '-5', '2.5', 'many', String(maxBatchSize + 1)])('falls back to the default for %s', (value) => {
    expect(readBatchSize(value)).toBe(100);
  });
});
