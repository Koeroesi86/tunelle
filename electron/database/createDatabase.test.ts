import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sqlite3';
import createDatabase from './createDatabase';
import { migrate } from './migrate';
import backfillSortKeys from './backfillSortKeys';

const database = { close: vi.fn((callback: (err: Error | null) => void) => callback(null)) };

vi.mock('./connectDatabase', () => ({ default: () => Promise.resolve(database) }));
vi.mock('./migrate');
vi.mock('./backfillSortKeys');

describe('createDatabase', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    database.close.mockImplementation((callback) => callback(null));
  });

  it('returns the open database once it is migrated', async () => {
    vi.mocked(migrate).mockResolvedValue(undefined);
    vi.mocked(backfillSortKeys).mockResolvedValue(undefined);

    await expect(createDatabase('/library.sqlite')).resolves.toBe<Database | typeof database>(database);

    expect(database.close).not.toHaveBeenCalled();
  });

  it('closes the database and passes on the error when a migration fails', async () => {
    vi.mocked(migrate).mockRejectedValue(new Error('no such table'));

    await expect(createDatabase('/library.sqlite')).rejects.toThrow('no such table');

    expect(database.close).toHaveBeenCalledOnce();
  });
});
