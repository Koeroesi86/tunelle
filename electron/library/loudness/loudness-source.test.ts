import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Database } from 'sqlite3';
import { powerMonitor } from 'electron';
import type { LoudnessAnalysis, TrackLoudness } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import { backgroundQueue } from '../tasks/background-queue';
import type { TaskSource } from '../tasks/task-queue';
import { findTracksToMeasure, saveTrackLoudness } from '../../repositories/loudness-repository';
import type { TrackToMeasure } from '../../repositories/loudness-repository';
import { getFolders } from '../../repositories/library-repository';
import { getSettings } from '../../repositories/settings-repository';
import { findOfflineFolders } from '../watch/folder-availability';
import { setPlaying } from './playback-state';
import { createLoudnessWindow, type Measurement } from './loudness-window';
import { poolAlbumGains } from './album-gains';
import { maxSeconds, registerLoudness } from './loudness-source';
import type { Task } from '../tasks/task-queue';

// everything the source reads or does outside of itself is replaced: the database and what is read from it, the drives, the window, the system and the queue
vi.mock('sqlite3', () => ({ Database: class {} }));
vi.mock('electron', () => ({ powerMonitor: { isOnBatteryPower: vi.fn() } }));
vi.mock('./album-gains', () => ({ poolAlbumGains: vi.fn() }));
vi.mock('./loudness-window', () => ({ createLoudnessWindow: vi.fn() }));
vi.mock('../../repositories/loudness-repository', () => ({ findTracksToMeasure: vi.fn(), saveTrackLoudness: vi.fn() }));
vi.mock('../../repositories/library-repository', () => ({ getFolders: vi.fn() }));
vi.mock('../../repositories/settings-repository', () => ({ getSettings: vi.fn() }));
vi.mock('../watch/folder-availability', async (importOriginal) => ({ ...(await importOriginal<object>()), findOfflineFolders: vi.fn() }));
// the queue is the one of the app, which the source is put on; the tests ask the source what it would do, and what its tasks do
vi.mock('../tasks/background-queue', () => ({
  scanKind: 'scan',
  backgroundQueue: { addSource: vi.fn(), enqueue: vi.fn(), dequeue: vi.fn(), isBusy: vi.fn(), idleFor: vi.fn() },
}));

const analysis: LoudnessAnalysis = {
  v: 1,
  sampleRate: 48000,
  channels: 2,
  integratedLufs: -12,
  loudnessRange: 5,
  samplePeak: 1.2,
  shortTerm: [-120],
  histogram: { bin: 0.1, counts: { '-121': 3 } },
};

const track = (file: string, extra: Partial<TrackToMeasure> = {}): TrackToMeasure => ({
  path: file,
  duration: 200,
  fileModified: 100,
  fileSize: 1000,
  trackGain: null,
  trackPeak: null,
  ...extra,
});

const idle = 30_000;
const rest = 60_000;
const byPath = (a: TrackToMeasure, b: TrackToMeasure) => a.path.localeCompare(b.path);

describe('the measurement of the loudness as a source of the background queue', () => {
  const database = new Database(':memory:');
  let measure: Mock<(path: string) => Promise<Measurement>>;
  let close: Mock<() => void>;
  let removeSource: Mock<() => boolean>;
  let source: TaskSource;
  let loudness: ReturnType<typeof registerLoudness>;
  /** What the library holds to be measured, and what was stored: a track that was stored is not asked for again, as the query leaves it out */
  let library: TrackToMeasure[];
  let stored: TrackLoudness[];
  const signal = new AbortController().signal;
  const measured: Measurement = { id: 1, outcome: 'measured', analysis, trackGain: -6, trackPeak: 1.2 };
  const elapse = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const register = () => {
    loudness = registerLoudness(database, 'tunelle://app/loudness.html');
    const registered = vi.mocked(backgroundQueue.addSource).mock.calls.at(-1)?.[0];
    if (!registered) throw new Error('The source was not put on the queue');
    source = registered;
  };
  const canRun = async () => (await source.canRun?.()) ?? true;
  /** The tasks of a pass over the library, run one after the other as the queue does, until the source has none */
  const drain = async () => {
    for (let task = await source.next(); task; task = await source.next()) await task.run(signal);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    delete process.env.TUNELLE_LOUDNESS_IDLE_SECONDS;
    library = [];
    stored = [];
    measure = vi.fn<(path: string) => Promise<Measurement>>().mockResolvedValue(measured);
    close = vi.fn<() => void>();
    removeSource = vi.fn<() => boolean>().mockReturnValue(true);
    vi.mocked(createLoudnessWindow).mockReturnValue({ measure, close });
    vi.mocked(backgroundQueue.addSource).mockReset().mockReturnValue(removeSource);
    vi.mocked(backgroundQueue.isBusy).mockReset().mockReturnValue(false);
    vi.mocked(backgroundQueue.idleFor).mockReset().mockReturnValue(idle);
    vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(false);
    vi.mocked(findTracksToMeasure)
      .mockReset()
      .mockImplementation(async (_database, afterPath, limit) =>
        library
          .filter((found) => found.path > afterPath && !stored.some((row) => row.path === found.path))
          .sort(byPath)
          .slice(0, limit)
      );
    vi.mocked(saveTrackLoudness)
      .mockReset()
      .mockImplementation(async (_database, row) => {
        stored.push(row);
        return [];
      });
    vi.mocked(backgroundQueue.enqueue).mockReset();
    vi.mocked(poolAlbumGains).mockReset().mockResolvedValue(0);
    vi.mocked(getFolders).mockReset().mockResolvedValue([]);
    vi.mocked(getSettings).mockReset().mockResolvedValue(undefined);
    vi.mocked(findOfflineFolders).mockReset().mockResolvedValue([]);
    setPlaying(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is put on the background queue below the scans, with the kind of its work', () => {
    register();

    expect(backgroundQueue.addSource).toHaveBeenCalledTimes(1);
    expect(source).toMatchObject({ kind: 'loudness', priority: 1 });
  });

  describe('what a task measures', () => {
    it('measures a track that has no gain tags, and keeps its gain, its peak and the analysis', async () => {
      library = [track('/music/a.flac')];
      register();
      await drain();

      expect(measure).toHaveBeenCalledWith('/music/a.flac');
      expect(saveTrackLoudness).toHaveBeenCalledWith(database, {
        path: '/music/a.flac',
        status: 'measured',
        reason: null,
        trackGain: -6,
        trackPeak: 1.2,
        albumGain: null,
        albumPeak: null,
        albumTracks: null,
        fileModified: 100,
        fileSize: 1000,
        analysisVersion,
        analysis,
      });
    });

    it('keeps the analysis of a track whose tags have the gain and the peak, and no gain of its own', async () => {
      library = [track('/music/a.flac', { trackGain: -3, trackPeak: 0.9 })];
      register();
      await drain();

      expect(stored).toEqual([expect.objectContaining({ status: 'measured', trackGain: null, trackPeak: null, analysis })]);
    });

    it('measures the peak of a track whose tags have a gain and no peak', async () => {
      library = [track('/music/a.opus', { trackGain: -3 })];
      register();
      await drain();

      expect(stored).toEqual([expect.objectContaining({ trackGain: -6, trackPeak: 1.2 })]);
    });

    it('gives the tracks one after the other, in the order the query gives them, with the path as the key of the task', async () => {
      library = ['/music/b.flac', '/music/a.flac', '/music/c.flac'].map((file) => track(file));
      register();
      const keys: string[] = [];
      for (let task = await source.next(); task; task = await source.next()) {
        keys.push(task.key);
        await task.run(signal);
      }

      expect(keys).toEqual(['/music/a.flac', '/music/b.flac', '/music/c.flac']);
      expect(measure.mock.calls.map(([file]) => file)).toEqual(keys);
    });

    it('asks for the tracks after the last one it was given, with the version of the analysis, and from the start again after the rest', async () => {
      library = [track('/music/a.flac')];
      register();
      await drain();
      elapse(rest + 1);
      await source.next();

      expect(vi.mocked(findTracksToMeasure).mock.calls.map(([, afterPath, , version]) => [afterPath, version])).toEqual([
        ['', analysisVersion],
        ['/music/a.flac', analysisVersion],
        ['', analysisVersion],
      ]);
    });

    it('has no task for a library without tracks', async () => {
      register();

      expect(await source.next()).toBeUndefined();
    });

    it('does not store what a task that was told to stop measured', async () => {
      library = [track('/music/a.flac')];
      register();
      const stopped = new AbortController();
      const task = await source.next();
      stopped.abort();
      await task?.run(stopped.signal);

      expect(saveTrackLoudness).not.toHaveBeenCalled();
    });

    it('leaves the tracks of a folder that is away, and measures the others', async () => {
      vi.mocked(getFolders).mockResolvedValue([
        { path: '/mnt/away', lastModified: 0 },
        { path: '/mnt/here', lastModified: 0 },
      ]);
      vi.mocked(findOfflineFolders).mockResolvedValue(['/mnt/away']);
      library = [track('/mnt/away/a.flac'), track('/mnt/here/b.flac')];
      register();
      await drain();

      expect(measure.mock.calls.map(([file]) => file)).toEqual(['/mnt/here/b.flac']);
    });
  });

  describe('what it waits for', () => {
    it('may run when nothing holds it back', async () => {
      register();

      expect(await canRun()).toBe(true);
    });

    it('waits while a scan runs, and until the idle time after it has passed', async () => {
      register();
      vi.mocked(backgroundQueue.isBusy).mockReturnValue(true);
      vi.mocked(backgroundQueue.idleFor).mockReturnValue(0);
      expect(await canRun()).toBe(false);

      vi.mocked(backgroundQueue.isBusy).mockReturnValue(false);
      vi.mocked(backgroundQueue.idleFor).mockReturnValue(idle - 1);
      expect(await canRun()).toBe(false);

      vi.mocked(backgroundQueue.idleFor).mockReturnValue(idle);
      expect(await canRun()).toBe(true);
    });

    it('takes the idle time from TUNELLE_LOUDNESS_IDLE_SECONDS, and the default for what is not a number', async () => {
      register();
      vi.mocked(backgroundQueue.idleFor).mockReturnValue(5000);

      process.env.TUNELLE_LOUDNESS_IDLE_SECONDS = '2';
      expect(await canRun()).toBe(true);
      process.env.TUNELLE_LOUDNESS_IDLE_SECONDS = '0';
      expect(await canRun()).toBe(true);
      process.env.TUNELLE_LOUDNESS_IDLE_SECONDS = 'soon';
      expect(await canRun()).toBe(false);
      process.env.TUNELLE_LOUDNESS_IDLE_SECONDS = '-3';
      expect(await canRun()).toBe(false);
      process.env.TUNELLE_LOUDNESS_IDLE_SECONDS = ' ';
      expect(await canRun()).toBe(false);
    });

    it('waits while a track plays, and goes on when it stops', async () => {
      register();
      setPlaying(true);
      expect(await canRun()).toBe(false);

      setPlaying(false);
      expect(await canRun()).toBe(true);
    });

    it('waits on battery', async () => {
      register();
      vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(true);
      expect(await canRun()).toBe(false);

      vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(false);
      expect(await canRun()).toBe(true);
    });

    it('does not run while the setting is off, and does when it is on or was never saved', async () => {
      register();
      vi.mocked(getSettings).mockResolvedValue({ measureLoudness: false });
      expect(await canRun()).toBe(false);

      vi.mocked(getSettings).mockResolvedValue({ measureLoudness: true });
      expect(await canRun()).toBe(true);

      vi.mocked(getSettings).mockResolvedValue({ volume: 1 });
      expect(await canRun()).toBe(true);
      vi.mocked(getSettings).mockResolvedValue(undefined);
      expect(await canRun()).toBe(true);
    });
  });

  describe('what it keeps', () => {
    it('stores a failure once, and does not give the track again', async () => {
      library = [track('/music/a.flac')];
      measure.mockResolvedValue({ id: 1, outcome: 'undecodable' });
      register();
      await drain();
      expect(stored).toEqual([expect.objectContaining({ status: 'failed', reason: 'undecodable', trackGain: null, analysis: null })]);

      elapse(rest + 1);
      await drain();

      expect(measure).toHaveBeenCalledTimes(1);
    });

    it.each<[string, Measurement]>([
      ['silent', { id: 1, outcome: 'silent' }],
      ['crashed', { outcome: 'crashed' }],
    ])('stores a track that is %s as failed with the reason', async (reason, result) => {
      library = [track('/music/a.flac')];
      measure.mockResolvedValue(result);
      register();
      await drain();

      expect(stored).toEqual([expect.objectContaining({ status: 'failed', reason })]);
    });

    it('stores nothing for a track that could not be read or did not answer, and gives it again after the rest', async () => {
      library = [track('/music/a.flac')];
      measure.mockResolvedValue({ id: 1, outcome: 'unreadable' });
      register();
      await drain();
      expect(stored).toEqual([]);
      expect(await canRun()).toBe(false);

      measure.mockResolvedValue(measured);
      elapse(rest + 1);
      expect(await canRun()).toBe(true);
      await drain();

      expect(measure).toHaveBeenCalledTimes(2);
      expect(stored).toEqual([expect.objectContaining({ status: 'measured' })]);
    });

    it('does not decode a track that is too long, and stores it as failed', async () => {
      library = [track('/music/mix.flac', { duration: maxSeconds + 1 })];
      register();
      await drain();

      expect(measure).not.toHaveBeenCalled();
      expect(stored).toEqual([expect.objectContaining({ status: 'failed', reason: 'too-large' })]);
    });

    it('stores the stat of the file as the library had it, so a file that changes meanwhile is measured again', async () => {
      library = [track('/music/a.flac', { fileModified: 555, fileSize: 777 })];
      register();
      await drain();

      expect(stored).toEqual([expect.objectContaining({ fileModified: 555, fileSize: 777 })]);
    });

    it('finds the tracks that a scan adds later, after the rest', async () => {
      register();
      await drain();
      expect(measure).not.toHaveBeenCalled();

      library = [track('/music/new.flac')];
      expect(await canRun()).toBe(false);
      elapse(rest + 1);
      await drain();

      expect(measure).toHaveBeenCalledWith('/music/new.flac');
    });
  });

  describe('the gains of the albums', () => {
    const pooling = () =>
      vi
        .mocked(backgroundQueue.enqueue)
        .mock.calls.map(([task]): Task => task)
        .filter((task) => task.key === 'album-gains');
    const lastPooling = () => {
      const task = pooling().at(-1);
      if (!task) throw new Error('No pooling was queued');
      return task;
    };

    it('are pooled once for what was stored before the start, which a scan may have changed', async () => {
      register();

      expect(pooling()).toEqual([expect.objectContaining({ kind: 'loudness', key: 'album-gains', priority: 1 })]);
      await lastPooling().run(signal);
      expect(poolAlbumGains).toHaveBeenCalledWith(database, signal);
    });

    it('are pooled again when a track was measured, and not when nothing was stored', async () => {
      library = [track('/music/a.flac')];
      measure.mockResolvedValueOnce({ id: 1, outcome: 'unreadable' });
      register();
      await drain();
      // the start and the end of the pass, none for the track
      expect(pooling()).toHaveLength(2);

      measure.mockResolvedValue(measured);
      elapse(rest + 1);
      await drain();

      // the track, and the end of the pass
      expect(pooling()).toHaveLength(4);
    });

    it('are pooled at the end of a pass, for the tracks a scan added or took away', async () => {
      register();
      await source.next();

      expect(pooling()).toHaveLength(2);
    });

    it('wait for a scan to end and for a pause after the last pooling, as the look goes over the library', async () => {
      register();
      const { canRun: mayPool } = lastPooling();
      vi.mocked(backgroundQueue.isBusy).mockReturnValue(true);
      expect(mayPool?.()).toBe(false);

      vi.mocked(backgroundQueue.isBusy).mockReturnValue(false);
      expect(mayPool?.()).toBe(true);
      await lastPooling().run(signal);
      expect(mayPool?.()).toBe(false);

      elapse(5000);
      expect(mayPool?.()).toBe(true);
    });

    it('do not stop the source when the pooling fails', async () => {
      vi.mocked(poolAlbumGains).mockRejectedValue(new Error('database is locked'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      register();

      await expect(lastPooling().run(signal)).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith('Pooling the gains of the albums failed', expect.any(Error));
    });
  });

  it('takes itself off the queue, takes its pooling off it and closes its window when it stops', () => {
    register();
    loudness.stop();

    expect(removeSource).toHaveBeenCalledTimes(1);
    expect(backgroundQueue.dequeue).toHaveBeenCalledWith('album-gains');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
