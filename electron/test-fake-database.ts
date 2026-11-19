import { Database } from 'sqlite3';

/** A database handle that opens nothing, for a unit test that mocks every module that reads and writes (docs/development/unit-tests.md) */
export const fakeDatabase = (): Database => Object.create(Database.prototype);
