import { secondsSchema } from '../../schemas/environment';
import path from 'path';
import { powerMonitor } from 'electron';
import type { Database } from 'sqlite3';
import type { LoudnessProgress, TrackLoudness } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import { readMainSettings } from '@shared/schemas/settings';
import { findTracksToMeasure, findTracksToMeasureAmong, getLoudnessProgress, saveTrackLoudness } from '../../repositories/loudness-repository';
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

const loudnessKind = 'loudness';
/** The pooling of the gains of the albums is not a track to measure: of its own kind, it is not counted among the tracks that wait or run */
const poolKind = 'loudness-pool';
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
/** After a track its task goes on for as long as the measurement took, so the work is half of the time and the computer stays cool; but never longer than this */
const coolDownRatio = 1;
const maxCoolDown = 30_000;
/** Waits for `ms`, or until the task is aborted; nothing is waited for when there is nothing to wait */
const rest = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, Math.max(0, ms));
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted || ms <= 0) done();
  });

/** The window is told how far the measurement is at most this often */
const statusPause = 2000;

/** How long no folder must have been scanned before a measurement starts, from `TUNELLE_LOUDNESS_IDLE_SECONDS`; what is not a number of seconds is the default */
const readIdleTime = (value = process.env.TUNELLE_LOUDNESS_IDLE_SECONDS) => secondsSchema(defaultIdleSeconds).parse(value) * 1000;

// only a saved off turns the measurement off
const isOff = (settings: unknown) => readMainSettings(settings).measureLoudness === false;

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
  // what is left to measure, the track that is measured included, and whether the measurement is turned off, for the state of the queue
  let remaining = 0;
  let off = false;

  /** Whether the measurement is turned off in the saved settings; the queue is told when that changed, as what waits is not counted then */
  const readOff = async () => {
    const turnedOff = isOff(await getSettings(database));
    if (turnedOff === off) return off;

    off = turnedOff;
    backgroundQueue.refresh();
    return off;
  };

  // the tracks that were queued or started and wait for their turn: the pass over the library leaves them to their own task
  const requested = new Set<string>();

  const mayRun = async () => {
    // a scan that ended since the rest began may have added tracks, so the rest is over then
    const resting = Date.now() < restUntil && backgroundQueue.idleFor(scanKind) >= Date.now() - (restUntil - restPause);
    if (resting || backgroundQueue.isBusy(scanKind) || backgroundQueue.idleFor(scanKind) < readIdleTime()) return false;
    return !powerMonitor.isOnBatteryPower() && !(await readOff());
  };

  let nextPoolAt = 0;
  let statusAt = 0;
  // the tracks that timed out, by path, and how many times in a row; it is kept while the app runs
  const timeouts = new Map<string, number>();

  const status = () => getLoudnessProgress(database, analysisVersion);

  const reportStatus = () => {
    statusAt = Date.now();
    return status().then(
      (progress) => {
        remaining = Math.max(0, progress.total - progress.measured - progress.failed);
        backgroundQueue.refresh();
        onStatus(progress);
      },
      (error) => console.error('Reading how far the loudness measurement is failed', error)
    );
  };

  /** The gains of the albums follow what was stored: when a track is measured, and at the end of a pass for the tracks a scan added or took away */
  const poolSoon = () =>
    backgroundQueue.enqueue({
      kind: poolKind,
      key: poolKey,
      priority,
      canRun: () => !backgroundQueue.isBusy(scanKind) && Date.now() >= nextPoolAt,
      run: async (signal) => {
        nextPoolAt = Date.now() + poolPause;
        await poolAlbumGains(database, signal).catch((error) => console.error('Pooling the gains of the albums failed', error));
        // the counts do not change with it, but the page asks again for what it shows when it is told, and the album gain of the song that plays is new
        await reportStatus();
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

  const store = async (result: TrackLoudness) => {
    await saveTrackLoudness(database, result);
    // counted down at once: the counts of the library are read at most every 2 s, and the queue shows this number
    remaining = Math.max(0, remaining - 1);
    backgroundQueue.refresh();
    poolSoon();
    if (Date.now() - statusAt >= statusPause) await reportStatus();
  };

  const measure =
    (track: TrackToMeasure): Task['run'] =>
    async (signal) => {
      // a drive that does not answer is left alone: the track is tried again after the rest, and counts nothing against it
      const mount = folders.find((folder) => isInsideFolder(folder, track.path)) ?? path.dirname(track.path);
      if (!(await mountGuard().isReadable(mount, track.path)) || signal.aborted) return;

      const started = Date.now();
      const measurement = await window.measure(track.path, track.duration ?? undefined);
      const coolDown = Math.min((Date.now() - started) * coolDownRatio, maxCoolDown);
      const result = toStored(track, measurement);
      if (result && !signal.aborted) await store(result);
      // the task stays on the queue while the source rests, so the queue shows the measurement as running
      await rest(coolDown, signal);
    };

  const readFolders = async () => (await getFolders(database)).map((folder) => folder.path);

  /** Measures the tracks that were queued or started before the rest of the library, in the order they were given, as tasks of their own: the same conditions hold, but no track waits for the pass to reach it */
  const prioritise = async (paths: string[]) => {
    if (await readOff()) return;

    const tracks = await findTracksToMeasureAmong(database, paths, analysisVersion);
    folders = await readFolders();
    paths
      .flatMap((path) => tracks.filter((track) => track.path === path))
      .forEach((track) => {
        requested.add(track.path);
        backgroundQueue.enqueue({
          kind: loudnessKind,
          key: track.path,
          priority,
          canRun: mayRun,
          run: (signal) => {
            requested.delete(track.path);
            return measure(track)(signal);
          },
        });
      });
  };

  /** The next track to measure; the end of the library starts the rest, and the next one starts again from the first track */
  const next = async (): Promise<Pick<Task, 'key' | 'run'> | undefined> => {
    const [track, ...rest] = reached.filter((candidate) => !requested.has(candidate.path));
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
    folders = await readFolders();
    reached = batch;
    return next();
  };

  // the tracks of a drive that is away stay unmeasured, so nothing is left to wait for while the source rests or the measurement is off;
  // the tracks that wait as tasks of their own are counted by the queue with them
  const pending = () => (off || Date.now() < restUntil ? 0 : Math.max(0, remaining - requested.size));
  const removeSource = backgroundQueue.addSource({ kind: loudnessKind, priority, canRun: mayRun, pending, next });
  // a scan that ended added or took away tracks: the settings are told at once, not with the next measurement
  let scanning = backgroundQueue.isBusy(scanKind);
  const stopWatchingScans = backgroundQueue.onChange(() => {
    const wasScanning = scanning;
    scanning = backgroundQueue.isBusy(scanKind);
    if (wasScanning && !scanning) reportStatus().catch(console.error);
  });
  // what was stored before this start may have changed on its own: a scan added or took away tracks while the app was closed
  poolSoon();

  return {
    status,
    /** The settings were saved: the count that waits follows the switch at once, not when the source is next asked to run */
    checkSetting: () => readOff().then(() => undefined),
    prioritise,
    /** Starts over from the first track after the measurements were cleared */
    restart: () => {
      cursor = '';
      reached = [];
      requested.clear();
      restUntil = 0;
      nextPoolAt = 0;
      poolSoon();
      return reportStatus();
    },
    stop: () => {
      stopWatchingScans();
      removeSource();
      backgroundQueue.dequeue(poolKey);
      window.close();
    },
  };
};
