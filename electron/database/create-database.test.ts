import { beforeEach, describe, expect, it, vi } from 'vitest';
import createDatabase from './create-database';
import { migrate } from './migrate';
import backfillSortKeys from './backfill-sort-keys';
import { fakeDatabase } from '../test-fake-database';

const database = fakeDatabase();

vi.mock('./connect-database', () => ({ default: () => Promise.resolve(database) }));
vi.mock('./migrate');
vi.mock('./backfill-sort-keys');

describe('createDatabase', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(database, 'close').mockImplementation((callback) => callback?.(null));
  });

  it('returns the open database once it is migrated', async () => {
    vi.mocked(migrate).mockResolvedValue(undefined);
    vi.mocked(backfillSortKeys).mockResolvedValue(undefined);

    await expect(createDatabase('/library.sqlite')).resolves.toBe(database);

    expect(database.close).not.toHaveBeenCalled();
  });

  it('closes the database and passes on the error when a migration fails', async () => {
    vi.mocked(migrate).mockRejectedValue(new Error('no such table'));

    await expect(createDatabase('/library.sqlite')).rejects.toThrow('no such table');

    expect(database.close).toHaveBeenCalledOnce();
  });
});
