import type { Database } from 'sqlite3';
import { text } from '@shared/schemas/library';
import { libraryRowSchema } from '../schemas/database/library';
import executeQuery from './execute-query';
import { toSortKeys } from './sort-key';
import { mapAsync } from '@shared/utils/map-async';

/** Fills the keys of the tracks that were added before there were any (migrations 006 and 009), nothing is done once every track has them */
const backfillSortKeys = (database: Database) =>
  executeQuery(
    database,
    {
      // the genre key is empty by default, a genre that is only space keeps an empty key and is read again at every start
      query: `SELECT path, title, artist, album, albumArtist, genre FROM library
      WHERE title_key IS NULL OR artist_key IS NULL OR album_key IS NULL OR (genre_key = '' AND TRIM(COALESCE(genre, '')) <> '')`,
      variables: [],
    },
    libraryRowSchema
      .pick({ path: true, title: true, artist: true, album: true, albumArtist: true, genre: true })
      // a track without the tag has NULL, which has the key of empty text
      .extend({ title: text, artist: text, album: text, genre: text })
  ).then(async (tracks) => {
    if (tracks.length === 0) return;

    // one transaction, as an update of its own is synced to the disk, which kept the splash busy for minutes on a large library; one at a time so a failure rolls back every update
    await executeQuery(database, { query: 'BEGIN', variables: [] });
    try {
      await mapAsync(tracks, (track) =>
        executeQuery(database, {
          query: `UPDATE library SET title_key = ?, artist_key = ?, album_key = ?, album_artist_key = ?, genre_key = ? WHERE path = ?`,
          variables: [...toSortKeys(track), track.path],
        })
      );
      await executeQuery(database, { query: 'COMMIT', variables: [] });
    } catch (error) {
      await executeQuery(database, { query: 'ROLLBACK', variables: [] }).catch(() => undefined);
      throw error;
    }
  });

export default backfillSortKeys;
