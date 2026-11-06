import type { Database } from 'sqlite3';
import { storedPlaylistSchema } from '@shared/schemas/playlists';
import type { StoredPlaylist } from '@shared/types/playlists';
import executeQuery from '../database/execute-query';
import { mapAsync } from '@shared/utils/map-async';
import { idRowSchema, playlistEntryRowSchema, playlistRowSchema } from '../schemas/rows';

/** The ids with `id` moved to `toIndex`, unchanged when the id is not there; an index past the end is the end */
export const movedTo = (ids: number[], id: number, toIndex: number) => {
  const rest = ids.filter((existing) => existing !== id);

  return ids.includes(id) ? rest.toSpliced(Math.min(Math.max(toIndex, 0), rest.length), 0, id) : ids;
};

/** Every playlist in its order with its entries in theirs */
export const getPlaylists = async (database: Database): Promise<StoredPlaylist[]> => {
  const playlists = await executeQuery(database, { query: `SELECT id, name FROM playlists ORDER BY position, id`, variables: [] }, playlistRowSchema);
  const entries = await executeQuery(
    database,
    { query: `SELECT id, playlist_id, path, snapshot FROM playlist_tracks ORDER BY position, id`, variables: [] },
    playlistEntryRowSchema
  );

  return storedPlaylistSchema.array().parse(
    playlists.map(({ id, name }) => ({
      id,
      name,
      entries: entries.filter((entry) => entry.playlist_id === id).map(({ id: entryId, path, snapshot }) => ({ id: entryId, path, snapshot })),
    }))
  );
};

/** The new playlist goes last, its id is returned */
export const createPlaylist = (database: Database, name: string) =>
  executeQuery(
    database,
    {
      query: `INSERT INTO playlists (name, position, created_at) SELECT ?, COALESCE(MAX(position) + 1, 0), ? FROM playlists RETURNING id`,
      variables: [name, Date.now()],
    },
    idRowSchema
  ).then(([{ id }]) => id);

export const renamePlaylist = (database: Database, id: number, name: string) =>
  executeQuery(database, { query: `UPDATE playlists SET name = ? WHERE id = ?`, variables: [name, id] });

export const deletePlaylist = (database: Database, id: number) =>
  executeQuery(database, { query: `DELETE FROM playlist_tracks WHERE playlist_id = ?`, variables: [id] }).then(() =>
    executeQuery(database, { query: `DELETE FROM playlists WHERE id = ?`, variables: [id] })
  );

const setPositions = (database: Database, table: 'playlists' | 'playlist_tracks', ids: number[]) =>
  mapAsync(ids, (id, position) => executeQuery(database, { query: `UPDATE ${table} SET position = ? WHERE id = ?`, variables: [position, id] }));

export const movePlaylist = async (database: Database, id: number, toIndex: number) => {
  const ids = (await executeQuery(database, { query: `SELECT id, name FROM playlists ORDER BY position, id`, variables: [] }, playlistRowSchema)).map(
    (row) => row.id
  );

  return setPositions(database, 'playlists', movedTo(ids, id, toIndex));
};

/** The tracks go to the end of the playlist in the order they are given, the same track again is another entry; a playlist that is not there gets none */
export const addEntries = async (database: Database, playlistId: number, tracks: { path: string; snapshot: unknown }[]) => {
  const [playlist] = await executeQuery(database, { query: `SELECT id FROM playlists WHERE id = ?`, variables: [playlistId] });
  if (!playlist) return undefined;

  // one after the other, as every entry takes the position after the one before
  return mapAsync(tracks, ({ path, snapshot }) =>
    executeQuery(database, {
      query: `INSERT INTO playlist_tracks (playlist_id, position, path, snapshot)
        SELECT ?, COALESCE(MAX(position) + 1, 0), ?, ? FROM playlist_tracks WHERE playlist_id = ?`,
      variables: [playlistId, path, JSON.stringify(snapshot), playlistId],
    })
  );
};

export const removeEntry = (database: Database, playlistId: number, entryId: number) =>
  executeQuery(database, { query: `DELETE FROM playlist_tracks WHERE playlist_id = ? AND id = ?`, variables: [playlistId, entryId] });

export const moveEntry = async (database: Database, playlistId: number, entryId: number, toIndex: number) => {
  const ids = (
    await executeQuery(database, { query: `SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position, id`, variables: [playlistId] }, idRowSchema)
  ).map((row) => row.id);

  return setPositions(database, 'playlist_tracks', movedTo(ids, entryId, toIndex));
};
