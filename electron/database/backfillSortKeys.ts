import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import executeQuery from './executeQuery';
import { toSortKeys } from './sortKey';

/** Fills the keys of the tracks that were added before there were any (migrations 006 and 009), nothing is done once every track has them */
const backfillSortKeys = (database: Database) =>
  executeQuery<Pick<Track, 'path' | 'title' | 'artist' | 'album' | 'albumArtist' | 'genre'>>(database, {
    // the genre key is empty by default, a genre that is only space keeps an empty key and is read again at every start
    query: `SELECT path, title, artist, album, albumArtist, genre FROM library
      WHERE title_key IS NULL OR artist_key IS NULL OR album_key IS NULL OR (genre_key = '' AND TRIM(COALESCE(genre, '')) <> '')`,
    variables: [],
  }).then(async (tracks) => {
    if (tracks.length === 0) return;

    // one transaction, as an update of its own is synced to the disk, which kept the splash busy for minutes on a large library; one at a time so a failure rolls back every update
    await executeQuery(database, { query: 'BEGIN', variables: [] });
    try {
      await tracks.reduce(
        (previous, track) =>
          previous.then(() =>
            executeQuery(database, {
              query: `UPDATE library SET title_key = ?, artist_key = ?, album_key = ?, album_artist_key = ?, genre_key = ? WHERE path = ?`,
              variables: [...toSortKeys(track), track.path],
            }).then(() => undefined)
          ),
        Promise.resolve()
      );
      await executeQuery(database, { query: 'COMMIT', variables: [] });
    } catch (error) {
      await executeQuery(database, { query: 'ROLLBACK', variables: [] }).catch(() => undefined);
      throw error;
    }
  });

export default backfillSortKeys;
