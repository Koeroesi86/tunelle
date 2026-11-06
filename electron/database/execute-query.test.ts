import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from 'sqlite3';
import executeQuery from './execute-query';
import { createTestDatabase } from '../test-database';

describe('executeQuery', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('resolves with the matching rows', async () => {
    await executeQuery(database, { query: 'INSERT INTO folders (path, lastModified) VALUES (?, ?)', variables: ['/music', 5] });

    await expect(executeQuery(database, { query: 'SELECT * FROM folders WHERE path = ?', variables: ['/music'] })).resolves.toEqual([
      { path: '/music', lastModified: 5 },
    ]);
  });

  it('resolves with an empty list when nothing matches', async () => {
    await expect(executeQuery(database, { query: 'SELECT * FROM folders', variables: [] })).resolves.toEqual([]);
  });

  it('rejects with the error message on invalid SQL', async () => {
    await expect(executeQuery(database, { query: 'SELECT * FROM missing_table', variables: [] })).rejects.toMatch(/no such table: missing_table/);
  });
});

describe('executeQuery with a schema', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
    await executeQuery(database, { query: 'INSERT INTO folders (path, lastModified) VALUES (?, ?)', variables: ['/music', 'late'] });
  });

  afterEach(() => {
    database.close();
  });

  it('resolves with the rows as the schema reads them', async () => {
    const schema = z.object({ path: z.string() }).transform(({ path }) => path.length);

    await expect(executeQuery(database, { query: 'SELECT path FROM folders', variables: [] }, schema)).resolves.toEqual([6]);
  });

  it('rejects with the field that has the wrong type', async () => {
    const schema = z.object({ path: z.string(), lastModified: z.number() });

    await expect(executeQuery(database, { query: 'SELECT * FROM folders', variables: [] }, schema)).rejects.toThrow(/lastModified/);
  });
});
