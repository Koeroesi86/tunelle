import { z } from 'zod';
import type { Database } from 'sqlite3';
import type { LoudnessProgress, TrackLoudness } from '@shared/types/loudness';
import { loudnessAnalysisSchema, loudnessProgressSchema } from '@shared/schemas/loudness';
import { libraryRowSchema } from '../schemas/database/library';
import { jsonOf } from '../schemas/rows';
import executeQuery from '../database/execute-query';
import executeQueries from '../database/execute-queries';
import { folderOfColumn } from './library-repository';
import { trackLoudnessRowSchema } from '../schemas/database/track-loudness';

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
  executeQuery(
    database,
    {
      query: `SELECT track_loudness.analysis AS analysis FROM track_loudness JOIN library ON library.path = track_loudness.path
      WHERE track_loudness.path = ? AND track_loudness.status = 'measured' AND track_loudness.analysisVersion = ?
      AND track_loudness.fileModified = library.fileModified AND track_loudness.fileSize = library.fileSize`,
      variables: [trackPath, version],
    },
    trackLoudnessRowSchema.pick({ analysis: true }).extend({ analysis: jsonOf(loudnessAnalysisSchema).nullable() })
  ).then(([row]) => row?.analysis ?? undefined);

const trackToMeasureRowSchema = libraryRowSchema.pick({ path: true, duration: true, fileModified: true, fileSize: true, trackGain: true, trackPeak: true });

export type TrackToMeasure = z.output<typeof trackToMeasureRowSchema>;

/**
 * The tracks after a path, in the order of their paths, that have no measurement to go by: none, one of another file than the library has now (a changed
 * file), or one of an older version. A failed measurement is not tried again until the file changes or the version rises
 */
export const findTracksToMeasure = (database: Database, afterPath: string, limit: number, version: number) =>
  executeQuery(
    database,
    {
      query: `SELECT library.path, library.duration, library.fileModified, library.fileSize, library.trackGain, library.trackPeak
      FROM library LEFT JOIN track_loudness ON track_loudness.path = library.path
      WHERE library.path > ? AND (track_loudness.path IS NULL OR track_loudness.analysisVersion != ?
        OR track_loudness.fileModified IS NOT library.fileModified OR track_loudness.fileSize IS NOT library.fileSize)
      ORDER BY library.path ASC LIMIT ?`,
      variables: [afterPath, version, limit],
    },
    trackToMeasureRowSchema
  );

/** The given tracks of the library that have no measurement to go by, by the same rule as `findTracksToMeasure` */
export const findTracksToMeasureAmong = (database: Database, paths: string[], version: number) =>
  paths.length === 0
    ? Promise.resolve([])
    : executeQuery(
        database,
        {
          query: `SELECT library.path, library.duration, library.fileModified, library.fileSize, library.trackGain, library.trackPeak
      FROM library LEFT JOIN track_loudness ON track_loudness.path = library.path
      WHERE library.path IN (${paths.map(() => '?').join(', ')}) AND (track_loudness.path IS NULL OR track_loudness.analysisVersion != ?
        OR track_loudness.fileModified IS NOT library.fileModified OR track_loudness.fileSize IS NOT library.fileSize)`,
          variables: [...paths, version],
        },
        trackToMeasureRowSchema
      );

// a track has its analysis when its row is a measurement of the file as it is, of the version asked for
const hasAnalysis = `track_loudness.status = 'measured' AND track_loudness.analysisVersion = ?
  AND track_loudness.fileModified IS library.fileModified AND track_loudness.fileSize IS library.fileSize`;

// a folder and an album title make one album, as everywhere in the library
const albumOf = `${folderOfColumn('library.path')} || char(0) || COALESCE(library.album, '')`;

const albumToPoolRowSchema = z.object({
  folder: z.string(),
  album: z.string(),
  tracks: z.number(),
  analysed: z.number(),
  marked: z.number(),
  minPooled: z.number(),
  maxPooled: z.number(),
});

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
  executeQuery(
    database,
    {
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
    },
    albumToPoolRowSchema
  ).then((rows) => rows.map(({ folder, album, tracks, analysed }): AlbumToPool => ({ folder, album, tracks, complete: analysed === tracks })));

/** The analyses of the tracks of an album, with the paths of their rows */
export const getAlbumAnalyses = (database: Database, { folder, album }: Pick<AlbumToPool, 'folder' | 'album'>, version: number) =>
  executeQuery(
    database,
    {
      query: `SELECT track_loudness.path AS path, track_loudness.analysis AS analysis FROM library JOIN track_loudness ON track_loudness.path = library.path
      WHERE ${folderOfColumn('library.path')} = ? AND library.album = ? AND ${hasAnalysis} ORDER BY track_loudness.path`,
      variables: [folder, album, version],
    },
    // a measured row has its analysis
    trackLoudnessRowSchema.pick({ path: true }).extend({ analysis: jsonOf(loudnessAnalysisSchema) })
  );

/** Store the gain of an album on the rows of its tracks, with the number of tracks it was pooled from; no gain is an album that is pooled and has none */
export const saveAlbumGain = (database: Database, paths: string[], gain: { albumGain: number; albumPeak: number } | undefined, tracks: number | null) =>
  executeQueries(
    database,
    paths.map((path) => ({
      query: `UPDATE track_loudness SET albumGain = ?, albumPeak = ?, albumTracks = ? WHERE path = ?`,
      variables: [gain?.albumGain ?? null, gain?.albumPeak ?? null, tracks, path],
    }))
  );

/** How many tracks have a measurement of their file as it is, and how many could not be measured (a failure counts until the file changes or the version rises) */
export const getLoudnessProgress = (database: Database, version: number) =>
  executeQuery(
    database,
    {
      query: `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN track_loudness.status = 'measured' THEN 1 ELSE 0 END), 0) AS measured,
        COALESCE(SUM(CASE WHEN track_loudness.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
      FROM library LEFT JOIN track_loudness ON track_loudness.path = library.path
        AND track_loudness.analysisVersion = ? AND track_loudness.fileModified IS library.fileModified AND track_loudness.fileSize IS library.fileSize`,
      variables: [version],
    },
    loudnessProgressSchema
  ).then(([status]): LoudnessProgress => status);

/** Forget every measurement: the tracks are measured again, and play at their tag gains until they are */
export const clearTrackLoudness = (database: Database) => executeQuery(database, { query: `DELETE FROM track_loudness`, variables: [] });
