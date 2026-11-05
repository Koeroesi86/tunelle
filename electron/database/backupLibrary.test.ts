import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupLibrary, backupLocation } from './backupLibrary';
import executeQuery from './executeQuery';

const open = (file: string) =>
  new Promise<sqlite3.Database>((done, fail) => {
    const database = new sqlite3.Database(file, (err) => (err ? fail(err) : done(database)));
  });

const close = (database: sqlite3.Database) =>
  new Promise<void>((done, fail) => {
    database.close((err) => (err ? fail(err) : done()));
  });

const query = <T>(database: sqlite3.Database, sql: string) => executeQuery<T>(database, { query: sql, variables: [] });

describe('backupLibrary', () => {
  let folder: string;
  let location: string;
  let database: sqlite3.Database;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tunelle-backup-'));
    location = join(folder, 'library.sqlite');
    database = await open(location);
  });

  afterEach(async () => {
    await close(database);
    await rm(folder, { recursive: true, force: true });
  });

  it('copies the library with its data to a file named after the version', async () => {
    await query(database, 'CREATE TABLE library (title TEXT)');
    await query(database, `INSERT INTO library VALUES ('A')`);

    await backupLibrary(database, location, 3);

    const copy = await open(backupLocation(location, 3));
    await expect(query(copy, 'SELECT title FROM library')).resolves.toEqual([{ title: 'A' }]);
    await close(copy);
  });

  it('replaces the copy that an earlier try left for the same version', async () => {
    await query(database, `CREATE TABLE library (title TEXT)`);
    await backupLibrary(database, location, 3);
    await query(database, `INSERT INTO library VALUES ('B')`);

    await backupLibrary(database, location, 3);

    const copy = await open(backupLocation(location, 3));
    await expect(query(copy, 'SELECT title FROM library')).resolves.toEqual([{ title: 'B' }]);
    await close(copy);
  });

  it('does not copy a new library that has no table', async () => {
    await backupLibrary(database, location, 0);

    await expect(writeFile(backupLocation(location, 0), '', { flag: 'wx' })).resolves.toBeUndefined();
  });
});
