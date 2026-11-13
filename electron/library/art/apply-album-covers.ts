import type { Database } from 'sqlite3';
import executeQuery from '../../database/execute-query';
import { albumCoverKeyColumn } from './album-cover-key';

/** Gives the tracks of an album the cover the user chose for it, also the ones a scan added or read again with the cover of their tags */
export const applyAlbumCovers = (database: Database) =>
  executeQuery(database, {
    query: `UPDATE library SET picture = (SELECT picture FROM album_covers WHERE key = ${albumCoverKeyColumn})
      WHERE ${albumCoverKeyColumn} IN (SELECT key FROM album_covers) AND picture IS NOT (SELECT picture FROM album_covers WHERE key = ${albumCoverKeyColumn})`,
    variables: [],
  });
