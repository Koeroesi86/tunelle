// Needs the real database: what migration 019 makes of rows that are there
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from './migrate';
import executeQuery from './execute-query';

const migrationsPath = path.resolve(__dirname, '../../migrations');
const rowSchema = z.object({ name: z.string(), source_sync: z.number() });

describe('migration 019, the sync of a playlist with its file', () => {
  let database: sqlite3.Database;
  let folder: string;
  const copy = (accept: (number: number) => boolean) =>
    readdirSync(migrationsPath)
      .filter((file) => accept(Number(file.slice(0, 3))))
      .forEach((file) => copyFileSync(path.join(migrationsPath, file), path.join(folder, file)));

  beforeEach(() => {
    database = new sqlite3.Database(':memory:');
    folder = mkdtempSync(path.join(os.tmpdir(), 'tunelle-migration-sync-'));
  });

  afterEach(() => {
    database.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('turns the sync on for the playlists that have a file and leaves it off for the others', async () => {
    copy((number) => number <= 18);
    await migrate(database, folder);
    await executeQuery(database, {
      query: `INSERT INTO playlists (name, position, created_at, source_path) VALUES ('imported', 0, 1, '/m/a.m3u'), ('made in the app', 1, 1, NULL)`,
      variables: [],
    });

    copy((number) => number === 19);
    await migrate(database, folder);

    expect(await executeQuery(database, { query: 'SELECT name, source_sync FROM playlists ORDER BY position', variables: [] }, rowSchema)).toEqual([
      { name: 'imported', source_sync: 1 },
      { name: 'made in the app', source_sync: 0 },
    ]);
  });

  it('leaves a playlist that is made after it with the sync off until it is linked to a file', async () => {
    copy(() => true);
    await migrate(database, folder);
    await executeQuery(database, { query: `INSERT INTO playlists (name, position, created_at) VALUES ('new', 0, 1)`, variables: [] });

    expect(await executeQuery(database, { query: 'SELECT name, source_sync FROM playlists', variables: [] }, rowSchema)).toEqual([
      { name: 'new', source_sync: 0 },
    ]);
  });

  it('adds the encoding the user chose and the entries to go back to, empty for every playlist', async () => {
    copy((number) => number <= 19);
    await migrate(database, folder);
    await executeQuery(database, {
      query: `INSERT INTO playlists (name, position, created_at, source_path) VALUES ('imported', 0, 1, '/m/a.m3u')`,
      variables: [],
    });

    copy((number) => number === 20);
    await migrate(database, folder);

    expect(
      await executeQuery(
        database,
        { query: 'SELECT source_encoding_override AS chosen, previous_entries AS previous FROM playlists', variables: [] },
        z.object({ chosen: z.null(), previous: z.null() })
      )
    ).toEqual([{ chosen: null, previous: null }]);
  });
});
