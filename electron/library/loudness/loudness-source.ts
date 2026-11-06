import path from 'path';
import { powerMonitor } from 'electron';
import type { Database } from 'sqlite3';
import type { LoudnessProgress, TrackLoudness } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import { isRecord } from '@shared/utils/is-record';
import { findTracksToMeasure, getLoudnessProgress, saveTrackLoudness } from '../../repositories/loudness-repository';
import type { TrackToMeasure } from '../../repositories/loudness-repository';
import { getFolders } from '../../repositories/library-repository';
import { getSettings } from '../../repositories/settings-repository';
import { isInsideFolder } from '../watch/folder-availability';
import { backgroundQueue, scanKind } from '../tasks/background-queue';
import type { Task } from '../tasks/task-queue';
import { poolAlbumGains } from './album-gains';
import { mountGuard } from '../mounts/mount-guard';
import { createLoudnessWindow } from './loudness-window';
import type { Measurement } from './loudness-window';
import { isPlaying } from './playback-state';

const loudnessKind = 'loudness';
/** Below the scans: what is measured waits for them, and for the user */
const priority = 1;
const batchSize = 20;
/** A track whose measurement timed out this many times in a row is stored as failed, as it would time out again on every pass */
const maxTimeouts = 3;
/** After a pass over the library the source waits this long to look for new tracks, and for the ones that were on a drive that is away or did not answer */
const restPause = 60_000;
const defaultIdleSeconds = 30;
/** The albums are pooled at most this often while tracks are measured, as the look for them goes over the library */
const poolPause = 5000;
const poolKey = 'album-gains';
/** The window is told how far the measurement is at most this often */
const statusPause = 2000;

/** How long no folder must have been scanned before a measurement starts, from `TUNELLE_LOUDNESS_IDLE_SECONDS`; what is not a number of seconds is the default */
const readIdleTime = (value = process.env.TUNELLE_LOUDNESS_IDLE_SECONDS) => {
  const seconds = value === undefined || value.trim() === '' ? Number.NaN : Number(value);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : defaultIdleSeconds) * 1000;
};

// only a saved off turns the measurement off
const isOff = (settings: unknown) => isRecord(settings) && settings.measureLoudness === false;

type Failure = 'crashed' | 'too-large' | 'silent' | 'undecodable' | 'timeout';

const row = (track: TrackToMeasure, fields: Pick<TrackLoudness, 'status' | 'reason' | 'analysis' | 'trackGain' | 'trackPeak'>): TrackLoudness => ({
  path: track.path,
  albumGain: null,
  albumPeak: null,
  albumTracks: null,
  // the stat of the file as the library had it before the measurement: a file that changes meanwhile differs from it, and is measured again
  fileModified: track.fileModified ?? null,
  fileSize: track.fileSize ?? null,
  analysisVersion,
  ...fields,
});

/** The outcomes that are stored as the failure of the track: the others (a drive that went away, a page that did not load) say nothing about the file */
const isFailure = (outcome: Measurement['outcome']): outcome is 'crashed' | 'silent' | 'undecodable' | 'too-large' =>
  ['crashed', 'silent', 'undecodable', 'too-large'].includes(outcome);

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
  return isFailure(measurement.outcome) ? failed(track, measurement.outcome) : undefined;
};

/** Puts the measurement of the loudness of the library on the background queue as a source of tasks, one track a task. See docs/app/loudness-measurement.md */
export const registerLoudness = (database: Database, pageUrl: string, onStatus: (status: LoudnessProgress) => void) => {
  const window = createLoudnessWindow(pageUrl);
  // the library folders, which are the mounts a track can be on: looked at with each batch of tracks
  let folders: string[] = [];
  let cursor = '';
  let reached: TrackToMeasure[] = [];
  let restUntil = 0;

  const mayRun = async () => {
    // a scan that ended since the rest began may have added tracks, so the rest is over then
    const resting = Date.now() < restUntil && backgroundQueue.idleFor(scanKind) >= Date.now() - (restUntil - restPause);
    if (resting || backgroundQueue.isBusy(scanKind) || backgroundQueue.idleFor(scanKind) < readIdleTime() || isPlaying()) return false;
    return !powerMonitor.isOnBatteryPower() && !isOff(await getSettings(database));
  };

  let nextPoolAt = 0;
  let statusAt = 0;
  // the tracks that timed out, by path, and how many times in a row; it is kept while the app runs
  const timeouts = new Map<string, number>();

  const status = () => getLoudnessProgress(database, analysisVersion);

  const reportStatus = () => {
    statusAt = Date.now();
    return status().then(onStatus, (error) => console.error('Reading how far the loudness measurement is failed', error));
  };

  /** The gains of the albums follow what was stored: when a track is measured, and at the end of a pass for the tracks a scan added or took away */
  const poolSoon = () =>
    backgroundQueue.enqueue({
      kind: loudnessKind,
      key: poolKey,
      priority,
      canRun: () => !backgroundQueue.isBusy(scanKind) && Date.now() >= nextPoolAt,
      run: async (signal) => {
        nextPoolAt = Date.now() + poolPause;
        await poolAlbumGains(database, signal).catch((error) => console.error('Pooling the gains of the albums failed', error));
      },
    });

  /** What to store for the measurement of a track: a timeout is stored as a failure only when it is the last of `maxTimeouts` in a row */
  const toStored = (track: TrackToMeasure, measurement: Measurement) => {
    if (measurement.outcome === 'unavailable') return undefined;
    const count = measurement.outcome === 'timeout' ? (timeouts.get(track.path) ?? 0) + 1 : 0;
    const result = count >= maxTimeouts ? failed(track, 'timeout') : toRow(track, measurement);
    if (count === 0 || result) timeouts.delete(track.path);
    else timeouts.set(track.path, count);
    return result;
  };

  const measure =
    (track: TrackToMeasure): Task['run'] =>
    async (signal) => {
      // a drive that does not answer is left alone: the track is tried again after the rest, and counts nothing against it
      const mount = folders.find((folder) => isInsideFolder(folder, track.path)) ?? path.dirname(track.path);
      if (!(await mountGuard().isReadable(mount, track.path)) || signal.aborted) return;

      const result = toStored(track, await window.measure(track.path, track.duration ?? undefined));
      if (!result || signal.aborted) return;

      await saveTrackLoudness(database, result);
      poolSoon();
      if (Date.now() - statusAt >= statusPause) await reportStatus();
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
      nextPoolAt = 0;
      poolSoon();
      await reportStatus();
      return undefined;
    }
    cursor = batch[batch.length - 1].path;
    folders = (await getFolders(database, ['path'])).map((folder) => folder.path);
    reached = batch;
    return next();
  };

  const removeSource = backgroundQueue.addSource({ kind: loudnessKind, priority, canRun: mayRun, next });
  // what was stored before this start may have changed on its own: a scan added or took away tracks while the app was closed
  poolSoon();

  return {
    status,
    /** Starts over from the first track after the measurements were cleared */
    restart: () => {
      cursor = '';
      reached = [];
      restUntil = 0;
      nextPoolAt = 0;
      poolSoon();
      return reportStatus();
    },
    stop: () => {
      removeSource();
      backgroundQueue.dequeue(poolKey);
      window.close();
    },
  };
};
