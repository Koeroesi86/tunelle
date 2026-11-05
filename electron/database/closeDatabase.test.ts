import { describe, expect, it, vi } from 'vitest';
import closeDatabase from './closeDatabase';
import connectDatabase from './connectDatabase';
import executeQuery from './executeQuery';

describe('closeDatabase', () => {
  it('closes the database, so it can not be queried any more', async () => {
    const database = await connectDatabase(':memory:');

    await closeDatabase(database);

    await expect(executeQuery(database, { query: 'SELECT 1', variables: [] })).rejects.toBeDefined();
  });

  it('resolves when the database is closed already', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = await connectDatabase(':memory:');
    await closeDatabase(database);

    await expect(closeDatabase(database)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'SQLITE_MISUSE' }));
  });
});
