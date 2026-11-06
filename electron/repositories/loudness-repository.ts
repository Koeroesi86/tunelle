import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import type { LoudnessAnalysis, TrackLoudness } from '@shared/types/loudness';
import executeQuery from '../database/execute-query';

const parseAnalysis = (json: string): LoudnessAnalysis => JSON.parse(json);

/** Store the measurement of a track, replacing the row it had */
export const saveTrackLoudness = (database: Database, row: TrackLoudness) =>
  executeQuery(database, {
    query: `INSERT OR REPLACE INTO track_loudness
      (path, status, trackGain, trackPeak, albumGain, albumPeak, fileModified, fileSize, analysisVersion, reason, analysis)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    variables: [
      row.path,
      row.status,
      row.trackGain,
      row.trackPeak,
      row.albumGain,
      row.albumPeak,
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
