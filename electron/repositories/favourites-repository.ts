import type { Database } from 'sqlite3';
import type { FavouriteKey } from '@shared/types/favourites';
import { favouriteRowSchema } from '../schemas/rows';
import executeQuery from '../database/execute-query';

/** The favourites of every source, the newest first */
export const getFavourites = (database: Database) =>
  executeQuery(
    database,
    { query: `SELECT source, kind, id, snapshot, added_at FROM favourites ORDER BY added_at DESC, rowid DESC`, variables: [] },
    favouriteRowSchema
  );

/** Adding a favourite again keeps the first one, with its date */
export const addFavourite = (database: Database, { source, kind, id }: FavouriteKey, snapshot: unknown) =>
  executeQuery(database, {
    query: `INSERT OR IGNORE INTO favourites (source, kind, id, snapshot, added_at) VALUES (?, ?, ?, ?, ?)`,
    variables: [source, kind, id, JSON.stringify(snapshot), Date.now()],
  });

export const removeFavourite = (database: Database, { source, kind, id }: FavouriteKey) =>
  executeQuery(database, { query: `DELETE FROM favourites WHERE source = ? AND kind = ? AND id = ?`, variables: [source, kind, id] });
