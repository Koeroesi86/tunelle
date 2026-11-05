import { describe, expect, it } from 'vitest';
import connectDatabase from './connectDatabase';
import executeQuery from './executeQuery';

describe('connectDatabase', () => {
  it('resolves with a usable database', async () => {
    const database = await connectDatabase(':memory:');

    await expect(executeQuery(database, { query: 'SELECT 1 AS value', variables: [] })).resolves.toEqual([{ value: 1 }]);
    database.close();
  });

  it('rejects with the error message when the database cannot be opened', async () => {
    await expect(connectDatabase('/nonexistent-directory/library.db')).rejects.toMatch(/unable to open database file/);
  });
});
