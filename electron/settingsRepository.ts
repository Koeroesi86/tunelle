import type { Database } from 'sqlite3';
import executeQuery from './executeQuery';

/** The stored settings, undefined when none were saved yet */
export const getSettings = (database: Database): Promise<unknown> =>
  executeQuery<{ settings: string }>(database, { query: `SELECT settings FROM settings WHERE id = ?`, variables: [1] }).then(([row]) =>
    row ? JSON.parse(row.settings) : undefined
  );

export const saveSettings = (database: Database, settings: unknown) =>
  executeQuery(database, {
    query: `INSERT INTO settings (id, settings) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET settings = excluded.settings`,
    variables: [1, JSON.stringify(settings)],
  });
