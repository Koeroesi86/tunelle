import type { Database } from 'sqlite3';
import type { LoudnessAnalysis, TrackLoudness } from '@shared/types/loudness';
import executeQuery from '../database/execute-query';

const parseAnalysis = (json: string): LoudnessAnalysis => JSON.parse(json);

/** Store the measurement of a track, replacing the row it had */
export const saveTrackLoudness = (database: Database, row: TrackLoudness) =>
  executeQuery(database, {
    query: `INSERT OR REPLACE INTO track_loudness
      (path, status, trackGain, trackPeak, albumGain, albumPeak, integratedLufs, loudnessRange, fileModified, fileSize, analysisVersion, measuredAt, reason, analysis)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    variables: [
      row.path,
      row.status,
      row.trackGain,
      row.trackPeak,
      row.albumGain,
      row.albumPeak,
      row.integratedLufs,
      row.loudnessRange,
      row.fileModified,
      row.fileSize,
      row.analysisVersion,
      row.measuredAt,
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
