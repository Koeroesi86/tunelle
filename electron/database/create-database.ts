import path from 'path';
import type { Database } from 'sqlite3';
import connectDatabase from './connect-database';
import closeDatabase from './close-database';
import { migrate } from './migrate';
import { backupLibrary } from './backup-library';
import backfillSortKeys from './backfill-sort-keys';

const migrationsPath = path.resolve(__dirname, '../../../migrations');

// the native sqlite3 addon aborts the process when it is torn down with the database open, so a library that cannot be set up is closed before the app exits
const createDatabase = (libraryLocation: string): Promise<Database> =>
  connectDatabase(libraryLocation).then((database) =>
    migrate(database, migrationsPath, { beforeApply: (version) => backupLibrary(database, libraryLocation, version) })
      .then(() => backfillSortKeys(database))
      .then(() => database)
      .catch((error) => closeDatabase(database).then(() => Promise.reject(error)))
  );

export default createDatabase;
