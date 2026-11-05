import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite3';
import executeQuery from './executeQuery';

const migrationName = /^(\d+)-.+\.sql$/;

/** The library was last opened by a newer version of the app than this one, so its schema is not one this version knows */
export class NewerLibraryError extends Error {
  constructor(
    readonly libraryVersion: number,
    readonly appVersion: number
  ) {
    super(`The library is at version ${libraryVersion}, this app only knows version ${appVersion}`);
  }
}

type Migration = { file: string; version: number };

type MigrateOptions = {
  /** Called with the version of the library before any pending migration is applied, not when there is nothing to apply */
  beforeApply?: (currentVersion: number) => Promise<void>;
};

const exec = (database: Database, query: string) =>
  new Promise<void>((resolve, reject) => {
    database.exec(query, (err) => (err ? reject(err) : resolve()));
  });

// only the names are read, the SQL of a migration that the library has seen is never opened
const listMigrations = (folder: string): Migration[] => {
  const files = fs.readdirSync(folder, 'utf8').filter((file) => file.endsWith('.sql'));

  const unnamed = files.find((file) => !Number(migrationName.exec(file)?.[1]));
  if (unnamed) throw new Error(`${unnamed} is not named like 004-name.sql with a number above 0`);

  const migrations = files.map((file) => ({ file, version: Number(migrationName.exec(file)?.[1]) })).sort((a, b) => a.version - b.version);

  const misplaced = migrations.find(({ version }, index) => version !== index + 1);
  if (misplaced)
    throw new Error(`${misplaced.file} is not named like 004-name.sql: the numbers start at 1, no number is skipped and no two migrations share one`);

  return migrations;
};

// the version is stored with the data, so a failed migration leaves both as they were
const apply = async (database: Database, folder: string, { file, version }: Migration) => {
  const query = fs.readFileSync(path.resolve(folder, file), 'utf8');
  await exec(database, 'BEGIN');
  try {
    await exec(database, `${query}\n;\nPRAGMA user_version = ${version};`);
    await exec(database, 'COMMIT');
  } catch (error) {
    await exec(database, 'ROLLBACK').catch(() => undefined);
    throw error;
  }
};

/**
 * Applies the migrations of the folder that the database has not seen, each one once and in the order of their number
 * See docs/app/migrations.md
 */
export const migrate = async (database: Database, folder: string, { beforeApply }: MigrateOptions = {}) => {
  const [{ user_version: current }] = await executeQuery<{ user_version: number }>(database, { query: 'PRAGMA user_version', variables: [] });
  const migrations = listMigrations(folder);

  if (current > migrations.length) throw new NewerLibraryError(current, migrations.length);

  const pending = migrations.filter(({ version }) => version > current);
  if (pending.length === 0) return;

  await beforeApply?.(current);
  await pending.reduce((previous, migration) => previous.then(() => apply(database, folder, migration)), Promise.resolve());
};
