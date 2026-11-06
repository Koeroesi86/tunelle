import { powerMonitor } from 'electron';
import type { Database } from 'sqlite3';
import type { TrackLoudness } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import { isRecord } from '@shared/utils/is-record';
import { findTracksToMeasure, saveTrackLoudness } from '../../repositories/loudness-repository';
import type { TrackToMeasure } from '../../repositories/loudness-repository';
import { getFolders } from '../../repositories/library-repository';
import { getSettings } from '../../repositories/settings-repository';
import { findOfflineFolders, isInsideFolder } from '../watch/folder-availability';
import { backgroundQueue, scanKind } from '../tasks/background-queue';
import type { Task } from '../tasks/task-queue';
import { createLoudnessWindow } from './loudness-window';
import type { Measurement } from './loudness-window';
import { isPlaying } from './playback-state';

/** A file longer than this is not decoded as a whole, which holds the decoded sound in memory (2.2 GB of the window for 45 minutes of stereo). See docs/app/loudness-measurement.md */
export const maxSeconds = 2700;

const loudnessKind = 'loudness';
/** Below the scans: what is measured waits for them, and for the user */
const priority = 1;
const batchSize = 20;
/** After a pass over the library the source waits this long to look for new tracks, and for the ones that were on a drive that is away or did not answer */
const restPause = 60_000;
const defaultIdleSeconds = 30;

/** How long no folder must have been scanned before a measurement starts, from `TUNELLE_LOUDNESS_IDLE_SECONDS`; what is not a number of seconds is the default */
const readIdleTime = (value = process.env.TUNELLE_LOUDNESS_IDLE_SECONDS) => {
  const seconds = value === undefined || value.trim() === '' ? Number.NaN : Number(value);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : defaultIdleSeconds) * 1000;
};

// only a saved off turns the measurement off
const isOff = (settings: unknown) => isRecord(settings) && settings.measureLoudness === false;

type Failure = 'crashed' | 'too-large' | 'silent' | 'undecodable';

const row = (track: TrackToMeasure, fields: Pick<TrackLoudness, 'status' | 'reason' | 'analysis' | 'trackGain' | 'trackPeak'>): TrackLoudness => ({
  path: track.path,
  albumGain: null,
  albumPeak: null,
  // the stat of the file as the library had it before the measurement: a file that changes meanwhile differs from it, and is measured again
  fileModified: track.fileModified ?? null,
  fileSize: track.fileSize ?? null,
  analysisVersion,
  ...fields,
});

const failed = (track: TrackToMeasure, reason: Failure) => row(track, { status: 'failed', reason, analysis: null, trackGain: null, trackPeak: null });

/** What to store for a measurement, undefined for one that is tried again later: a drive that went away says nothing about the file */
const toRow = (track: TrackToMeasure, measurement: Measurement): TrackLoudness | undefined => {
  if (measurement.outcome === 'measured') {
    // the tags have the gain and the peak, or they do not: the measurement is the way to the ones that are missing
    const computeGain = track.trackGain == null || track.trackPeak == null;
    return row(track, {
      status: 'measured',
      reason: null,
      analysis: measurement.analysis,
      trackGain: computeGain ? measurement.trackGain : null,
      trackPeak: computeGain ? measurement.trackPeak : null,
    });
  }
  if (measurement.outcome === 'crashed') return failed(track, 'crashed');
  return measurement.outcome === 'silent' || measurement.outcome === 'undecodable' ? failed(track, measurement.outcome) : undefined;
};

/** The tracks of the batch that are not in a folder that is away */
const reachable = async (database: Database, tracks: TrackToMeasure[]) => {
  const offline = await findOfflineFolders(database, await getFolders(database, ['path']));
  return tracks.filter((track) => !offline.some((folder) => isInsideFolder(folder, track.path)));
};

/** Puts the measurement of the loudness of the library on the background queue as a source of tasks, one track a task. See docs/app/loudness-measurement.md */
export const registerLoudness = (database: Database, pageUrl: string) => {
  const window = createLoudnessWindow(pageUrl);
  let cursor = '';
  let reached: TrackToMeasure[] = [];
  let restUntil = 0;

  const mayRun = async () => {
    if (Date.now() < restUntil || backgroundQueue.isBusy(scanKind) || backgroundQueue.idleFor(scanKind) < readIdleTime() || isPlaying()) return false;
    return !powerMonitor.isOnBatteryPower() && !isOff(await getSettings(database));
  };

  const measure =
    (track: TrackToMeasure): Task['run'] =>
    async (signal) => {
      const result = (track.duration ?? 0) > maxSeconds ? failed(track, 'too-large') : toRow(track, await window.measure(track.path));
      if (result && !signal.aborted) await saveTrackLoudness(database, result);
    };

  /** The next track to measure; the end of the library starts the rest, and the next one starts again from the first track */
  const next = async (): Promise<Pick<Task, 'key' | 'run'> | undefined> => {
    const [track, ...rest] = reached;
    if (track) {
      reached = rest;
      return { key: track.path, run: measure(track) };
    }

    const batch = await findTracksToMeasure(database, cursor, batchSize, analysisVersion);
    if (batch.length === 0) {
      cursor = '';
      restUntil = Date.now() + restPause;
      return undefined;
    }
    cursor = batch[batch.length - 1].path;
    reached = await reachable(database, batch);
    return next();
  };

  const removeSource = backgroundQueue.addSource({ kind: loudnessKind, priority, canRun: mayRun, next });

  return {
    stop: () => {
      removeSource();
      window.close();
    },
  };
};
