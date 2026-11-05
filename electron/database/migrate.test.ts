import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import executeQuery from './executeQuery';
import { migrate, NewerLibraryError } from './migrate';

const openDatabase = () =>
  new Promise<sqlite3.Database>((done, fail) => {
    const database = new sqlite3.Database(':memory:', (err) => (err ? fail(err) : done(database)));
  });

const query = <T>(database: sqlite3.Database, sql: string) => executeQuery<T>(database, { query: sql, variables: [] });
const getVersion = (database: sqlite3.Database) => query<{ user_version: number }>(database, 'PRAGMA user_version').then(([{ user_version }]) => user_version);
const getColumns = (database: sqlite3.Database, table: string) =>
  query<{ name: string }>(database, `PRAGMA table_info(${table})`).then((rows) => rows.map(({ name }) => name));

describe('migrate', () => {
  let folder: string;
  let database: sqlite3.Database;
  const add = (file: string, sql: string) => writeFile(join(folder, file), sql);

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tunelle-migrate-'));
    database = await openDatabase();
  });

  afterEach(async () => {
    database.close();
    await rm(folder, { recursive: true, force: true });
  });

  it('applies the migrations in the order of their number and stores the last one', async () => {
    await add('002-add-note.sql', 'ALTER TABLE items ADD COLUMN note TEXT');
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');

    await migrate(database, folder);

    await expect(getColumns(database, 'items')).resolves.toEqual(['id', 'note']);
    await expect(getVersion(database)).resolves.toBe(2);
  });

  it('applies a migration once, so a statement that is not safe to repeat is fine', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await add('002-add-note.sql', 'ALTER TABLE items ADD COLUMN note TEXT');

    await migrate(database, folder);
    await migrate(database, folder);

    await expect(getColumns(database, 'items')).resolves.toEqual(['id', 'note']);
  });

  it('applies only the migrations that came with a newer version of the app', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await migrate(database, folder);
    await add('002-add-note.sql', 'ALTER TABLE items ADD COLUMN note TEXT');

    await migrate(database, folder);

    await expect(getColumns(database, 'items')).resolves.toEqual(['id', 'note']);
    await expect(getVersion(database)).resolves.toBe(2);
  });

  it('leaves the data and the version as they were when a migration fails', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await add('002-broken.sql', 'ALTER TABLE items ADD COLUMN note TEXT; ALTER TABLE missing ADD COLUMN note TEXT');

    await expect(migrate(database, folder)).rejects.toThrow('no such table');

    await expect(getColumns(database, 'items')).resolves.toEqual(['id']);
    await expect(getVersion(database)).resolves.toBe(1);
  });

  it.each([['create-items.sql'], ['000-create-items.sql']])('refuses %s, it has no number', async (file) => {
    await add(file, 'CREATE TABLE items (id INTEGER PRIMARY KEY)');

    await expect(migrate(database, folder)).rejects.toThrow('is not named like');
  });

  it('refuses two migrations with the same number', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await add('001-create-notes.sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY)');

    await expect(migrate(database, folder)).rejects.toThrow('is not named like');
  });

  it('refuses a number that is skipped', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await add('003-add-note.sql', 'ALTER TABLE items ADD COLUMN note TEXT');

    await expect(migrate(database, folder)).rejects.toThrow('003-add-note.sql is not named like');
  });

  it('ignores a file that is not SQL', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await add('README.md', 'notes');

    await expect(migrate(database, folder)).resolves.toBeUndefined();
  });

  it('does not open the SQL of a migration the library has seen', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await migrate(database, folder);
    await rm(join(folder, '001-create-items.sql'));
    // a folder cannot be read as a file, so the test fails if the SQL is opened
    await mkdir(join(folder, '001-create-items.sql'));

    await expect(migrate(database, folder)).resolves.toBeUndefined();
  });

  it('leaves a library alone that is ahead of the migrations of the app', async () => {
    await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await query(database, 'PRAGMA user_version = 5');

    await expect(migrate(database, folder)).rejects.toThrow(NewerLibraryError);
    await expect(getVersion(database)).resolves.toBe(5);
  });

  describe('before applying', () => {
    it('calls back with the version of the library when migrations are pending', async () => {
      await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
      await migrate(database, folder);
      await add('002-add-note.sql', 'ALTER TABLE items ADD COLUMN note TEXT');
      const seen: number[] = [];

      await migrate(database, folder, { beforeApply: async (version) => void seen.push(version) });

      expect(seen).toEqual([1]);
    });

    it('does not call back when there is nothing to apply', async () => {
      await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');
      await migrate(database, folder);
      const seen: number[] = [];

      await migrate(database, folder, { beforeApply: async (version) => void seen.push(version) });

      expect(seen).toEqual([]);
    });

    it('applies nothing when the callback fails', async () => {
      await add('001-create-items.sql', 'CREATE TABLE items (id INTEGER PRIMARY KEY)');

      await expect(migrate(database, folder, { beforeApply: () => Promise.reject(new Error('disk full')) })).rejects.toThrow('disk full');

      await expect(getVersion(database)).resolves.toBe(0);
    });
  });

  describe('migrations of the app', () => {
    const migrationsPath = resolve(__dirname, '../../migrations');

    it('create the tables and keep an existing library, also one from before the version was stored', async () => {
      const files = await readdir(migrationsPath);
      // 001 to 003 are the ones that ran on every start before the version was stored
      await Promise.all(
        files.filter((file) => /^00[1-3]-/.test(file)).map((file) => readFile(join(migrationsPath, file), 'utf8').then((sql) => query(database, sql)))
      );
      await query(database, `INSERT INTO library (path, title) VALUES ('/music/a.flac', 'A')`);
      await expect(getVersion(database)).resolves.toBe(0);

      await migrate(database, migrationsPath);

      await expect(query(database, 'SELECT title, title_key FROM library')).resolves.toEqual([{ title: 'A', title_key: null }]);
      await expect(getVersion(database)).resolves.toBe(files.length);
    });

    it('can be applied to a new database twice', async () => {
      await migrate(database, migrationsPath);

      await expect(migrate(database, migrationsPath)).resolves.toBeUndefined();
    });
  });
});
