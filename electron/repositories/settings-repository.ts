import type { Database } from 'sqlite3';
import executeQuery from '../database/execute-query';
import { json } from '../schemas/rows';
import { settingsRowSchema } from '../schemas/database/settings';

const settingsReadSchema = settingsRowSchema.pick({ settings: true }).extend({ settings: json });

/** The stored settings, undefined when none were saved yet */
export const getSettings = (database: Database): Promise<unknown> =>
  executeQuery(database, { query: `SELECT settings FROM settings WHERE id = ?`, variables: [1] }, settingsReadSchema).then(([row]) => row?.settings);

export const saveSettings = (database: Database, settings: unknown) =>
  executeQuery(database, {
    query: `INSERT INTO settings (id, settings) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET settings = excluded.settings`,
    variables: [1, JSON.stringify(settings)],
  });
