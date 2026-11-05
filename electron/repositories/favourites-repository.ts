import type { Database } from 'sqlite3';
import type { FavouriteKey, StoredFavourite } from '@shared/types/favourites';
import executeQuery from '../database/execute-query';

interface FavouriteRow extends FavouriteKey {
  snapshot: string;
  added_at: number;
}

const toStored = ({ added_at, snapshot, ...key }: FavouriteRow): StoredFavourite => ({ ...key, snapshot: JSON.parse(snapshot), addedAt: added_at });

/** The favourites of every source, the newest first */
export const getFavourites = (database: Database) =>
  executeQuery<FavouriteRow>(database, {
    query: `SELECT source, kind, id, snapshot, added_at FROM favourites ORDER BY added_at DESC, rowid DESC`,
    variables: [],
  }).then((rows) => rows.map(toStored));

/** Adding a favourite again keeps the first one, with its date */
export const addFavourite = (database: Database, { source, kind, id }: FavouriteKey, snapshot: unknown) =>
  executeQuery(database, {
    query: `INSERT OR IGNORE INTO favourites (source, kind, id, snapshot, added_at) VALUES (?, ?, ?, ?, ?)`,
    variables: [source, kind, id, JSON.stringify(snapshot), Date.now()],
  });

export const removeFavourite = (database: Database, { source, kind, id }: FavouriteKey) =>
  executeQuery(database, { query: `DELETE FROM favourites WHERE source = ? AND kind = ? AND id = ?`, variables: [source, kind, id] });
