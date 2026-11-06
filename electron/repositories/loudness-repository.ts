import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import type { LoudnessAnalysis, TrackLoudness } from '@shared/types/loudness';
import executeQuery from '../database/execute-query';
import executeQueries from '../database/execute-queries';
import { folderOfColumn } from './library-repository';

const parseAnalysis = (json: string): LoudnessAnalysis => JSON.parse(json);

/** Store the measurement of a track, replacing the row it had */
export const saveTrackLoudness = (database: Database, row: TrackLoudness) =>
  executeQuery(database, {
    query: `INSERT OR REPLACE INTO track_loudness
      (path, status, trackGain, trackPeak, albumGain, albumPeak, albumTracks, fileModified, fileSize, analysisVersion, reason, analysis)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    variables: [
      row.path,
      row.status,
      row.trackGain,
      row.trackPeak,
      row.albumGain,
      row.albumPeak,
      row.albumTracks,
      row.fileModified,
      row.fileSize,
      row.analysisVersion,
      row.reason,
      row.analysis ? JSON.stringify(row.analysis) : null,
    ],
  });

/** The analysis of a track while it is of the file as it is and of the version asked for, undefined for a track that has none, a failed one, or a stale one */
export const findLoudnessAnalysis = (database: Database, trackPath: string, version: number) =>
  executeQuery<{ analysis: string }>(database, {
    query: `SELECT track_loudness.analysis AS analysis FROM track_loudness JOIN library ON library.path = track_loudness.path
      WHERE track_loudness.path = ? AND track_loudness.status = 'measured' AND track_loudness.analysisVersion = ?
      AND track_loudness.fileModified = library.fileModified AND track_loudness.fileSize = library.fileSize`,
    variables: [trackPath, version],
  }).then(([row]) => (row?.analysis ? parseAnalysis(row.analysis) : undefined));

export type TrackToMeasure = Pick<Track, 'path' | 'duration' | 'fileModified' | 'fileSize' | 'trackGain' | 'trackPeak'>;

/**
 * The tracks after a path, in the order of their paths, that have no measurement to go by: none, one of another file than the library has now (a changed
 * file), or one of an older version. A failed measurement is not tried again until the file changes or the version rises
 */
export const findTracksToMeasure = (database: Database, afterPath: string, limit: number, version: number) =>
  executeQuery<TrackToMeasure>(database, {
    query: `SELECT library.path, library.duration, library.fileModified, library.fileSize, library.trackGain, library.trackPeak
      FROM library LEFT JOIN track_loudness ON track_loudness.path = library.path
      WHERE library.path > ? AND (track_loudness.path IS NULL OR track_loudness.analysisVersion != ?
        OR track_loudness.fileModified IS NOT library.fileModified OR track_loudness.fileSize IS NOT library.fileSize)
      ORDER BY library.path ASC LIMIT ?`,
    variables: [afterPath, version, limit],
  });

// a track has its analysis when its row is a measurement of the file as it is, of the version asked for
const hasAnalysis = `track_loudness.status = 'measured' AND track_loudness.analysisVersion = ?
  AND track_loudness.fileModified IS library.fileModified AND track_loudness.fileSize IS library.fileSize`;

// a folder and an album title make one album, as everywhere in the library
const albumOf = `${folderOfColumn('library.path')} || char(0) || COALESCE(library.album, '')`;

export interface AlbumToPool {
  /** The album as the library groups it: the folder of its tracks, with its separator, and the title */
  folder: string;
  album: string;
  tracks: number;
  /** Whether every track of the album has its analysis: the album gets a gain then, and loses it otherwise */
  complete: boolean;
}

/** The albums whose gain is not what their tracks say: to pool, or to take the gain from. See docs/app/loudness-measurement.md */
export const findAlbumsToPool = (database: Database, version: number) =>
  executeQuery<{ folder: string; album: string; tracks: number; analysed: number; marked: number; minPooled: number; maxPooled: number }>(database, {
    query: `SELECT ${folderOfColumn('library.path')} AS folder, library.album AS album, COUNT(*) AS tracks,
        SUM(CASE WHEN ${hasAnalysis} THEN 1 ELSE 0 END) AS analysed,
        SUM(CASE WHEN ${hasAnalysis} AND track_loudness.albumTracks IS NOT NULL THEN 1 ELSE 0 END) AS marked,
        MIN(COALESCE(track_loudness.albumTracks, -1)) AS minPooled,
        MAX(COALESCE(track_loudness.albumTracks, -1)) AS maxPooled
      FROM library LEFT JOIN track_loudness ON track_loudness.path = library.path
      WHERE COALESCE(library.album, '') != ''
      GROUP BY ${albumOf}
      HAVING (analysed = tracks AND (minPooled != tracks OR maxPooled != tracks)) OR (analysed < tracks AND marked > 0)`,
    variables: [version, version],
  }).then((rows) => rows.map(({ folder, album, tracks, analysed }): AlbumToPool => ({ folder, album, tracks, complete: analysed === tracks })));

/** The analyses of the tracks of an album, with the paths of their rows */
export const getAlbumAnalyses = (database: Database, { folder, album }: Pick<AlbumToPool, 'folder' | 'album'>, version: number) =>
  executeQuery<{ path: string; analysis: string }>(database, {
    query: `SELECT track_loudness.path AS path, track_loudness.analysis AS analysis FROM library JOIN track_loudness ON track_loudness.path = library.path
      WHERE ${folderOfColumn('library.path')} = ? AND library.album = ? AND ${hasAnalysis} ORDER BY track_loudness.path`,
    variables: [folder, album, version],
  }).then((rows) => rows.map(({ path, analysis }) => ({ path, analysis: parseAnalysis(analysis) })));

/** Store the gain of an album on the rows of its tracks, with the number of tracks it was pooled from; no gain is an album that is pooled and has none */
export const saveAlbumGain = (database: Database, paths: string[], gain: { albumGain: number; albumPeak: number } | undefined, tracks: number | null) =>
  executeQueries(
    database,
    paths.map((path) => ({
      query: `UPDATE track_loudness SET albumGain = ?, albumPeak = ?, albumTracks = ? WHERE path = ?`,
      variables: [gain?.albumGain ?? null, gain?.albumPeak ?? null, tracks, path],
    }))
  );
