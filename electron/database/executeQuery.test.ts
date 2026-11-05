import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import executeQuery from './executeQuery';
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
