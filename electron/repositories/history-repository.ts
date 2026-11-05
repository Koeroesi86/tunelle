import type { Database } from 'sqlite3';
import type { FavouriteKey, StoredHistoryItem } from '@shared/types/favourites';
import executeQuery from '../database/execute-query';

/** The history keeps this many items, the oldest are dropped when something is played */
export const historyLimit = 100;

interface HistoryRow extends FavouriteKey {
  snapshot: string;
  played_at: number;
}

const toStored = ({ played_at, snapshot, ...key }: HistoryRow): StoredHistoryItem => ({ ...key, snapshot: JSON.parse(snapshot), playedAt: played_at });

/** What was played, of every source, the last played first */
export const getHistory = (database: Database) =>
  executeQuery<HistoryRow>(database, {
    query: `SELECT source, kind, id, snapshot, played_at FROM history ORDER BY played_at DESC, rowid DESC LIMIT ?`,
    variables: [historyLimit],
  }).then((rows) => rows.map(toStored));

/** Playing an item again moves it to the top, with its snapshot as it is now */
export const recordPlayed = async (database: Database, { source, kind, id }: FavouriteKey, snapshot: unknown) => {
  await executeQuery(database, {
    query: `INSERT INTO history (source, kind, id, snapshot, played_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (source, kind, id) DO UPDATE SET snapshot = excluded.snapshot, played_at = excluded.played_at`,
    variables: [source, kind, id, JSON.stringify(snapshot), Date.now()],
  });
  await executeQuery(database, {
    query: `DELETE FROM history WHERE rowid NOT IN (SELECT rowid FROM history ORDER BY played_at DESC, rowid DESC LIMIT ?)`,
    variables: [historyLimit],
  });
};

export const clearHistory = (database: Database) => executeQuery(database, { query: `DELETE FROM history`, variables: [] });
