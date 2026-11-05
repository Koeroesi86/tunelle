import { rm } from 'fs/promises';
import type { Database } from 'sqlite3';
import executeQuery from './execute-query';

/** Where the copy of a library at the given version goes, a later copy of the same version replaces it */
export const backupLocation = (libraryLocation: string, version: number) => `${libraryLocation}.v${version}.bak`;

/**
 * Copies the library next to itself before a migration changes it, as a migration that commits cannot be rolled back
 * See docs/app/migrations.md
 */
export const backupLibrary = async (database: Database, libraryLocation: string, version: number) => {
  const tables = await executeQuery(database, { query: `SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1`, variables: [] });
  if (tables.length === 0) return;

  const target = backupLocation(libraryLocation, version);
  await rm(target, { force: true });
  await executeQuery(database, { query: 'VACUUM INTO ?', variables: [target] });
};
