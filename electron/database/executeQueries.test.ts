import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import executeQueries from './executeQueries';
import { createTestDatabase } from '../test-database';

describe('executeQueries', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('resolves with one result list per query, in order', async () => {
    const results = await executeQueries(database, [
      { query: 'SELECT 1 AS value', variables: [] },
      { query: 'SELECT ? AS value', variables: [2] },
    ]);

    expect(results).toEqual([[{ value: 1 }], [{ value: 2 }]]);
  });

  it('resolves with an empty list for no queries', async () => {
    await expect(executeQueries(database, [])).resolves.toEqual([]);
  });

  it('rejects when any query fails', async () => {
    await expect(
      executeQueries(database, [
        { query: 'SELECT 1', variables: [] },
        { query: 'SELECT * FROM missing_table', variables: [] },
      ])
    ).rejects.toMatch(/no such table/);
  });
});
