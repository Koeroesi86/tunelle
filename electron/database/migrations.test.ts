import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import type { Database } from 'sqlite3';
import { migrate } from './migrate';
import executeQuery from './executeQuery';
import { createTestDatabase } from '../test-database';

const migrationsPath = path.resolve(__dirname, '../../migrations');

describe('migrations', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('creates the folders, library, settings, favourites and history tables', async () => {
    const tables = await executeQuery<{ name: string }>(database, {
      query: `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      variables: [],
    });

    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['folders', 'library', 'settings', 'favourites', 'history']));
  });

  it('has every folder scanned again after the loudness columns are added, as the scan skips a folder that did not change', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'tunelle-migrations-'));
    const old = new sqlite3.Database(':memory:');
    try {
      readdirSync(migrationsPath)
        .filter((file) => Number(file.slice(0, 3)) < 11)
        .forEach((file) => copyFileSync(path.join(migrationsPath, file), path.join(folder, file)));
      await migrate(old, folder);
      await executeQuery(old, { query: `INSERT INTO folders (path, lastModified) VALUES ('/music', 1700000000000)`, variables: [] });
      copyFileSync(path.join(migrationsPath, '011-add-loudness.sql'), path.join(folder, '011-add-loudness.sql'));

      await migrate(old, folder);

      expect(await executeQuery(old, { query: 'SELECT path, lastModified FROM folders', variables: [] })).toEqual([{ path: '/music', lastModified: 0 }]);
    } finally {
      old.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
