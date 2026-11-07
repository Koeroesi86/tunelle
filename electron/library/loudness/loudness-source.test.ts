import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Database } from 'sqlite3';
import { powerMonitor } from 'electron';
import type { LoudnessAnalysis, LoudnessProgress, TrackLoudness } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import { backgroundQueue } from '../tasks/background-queue';
import type { TaskSource } from '../tasks/task-queue';
import { findTracksToMeasure, findTracksToMeasureAmong, getLoudnessProgress, saveTrackLoudness } from '../../repositories/loudness-repository';
import type { TrackToMeasure } from '../../repositories/loudness-repository';
import { getFolders } from '../../repositories/library-repository';
import { getSettings } from '../../repositories/settings-repository';
import { createLoudnessWindow, type Measurement } from './loudness-window';
import { poolAlbumGains } from './album-gains';
import { mountGuard } from '../mounts/mount-guard';
import { registerLoudness } from './loudness-source';
import type { Task } from '../tasks/task-queue';

// everything the source reads or does outside of itself is replaced: the database and what is read from it, the drives, the window, the system and the queue
vi.mock('sqlite3', () => ({ Database: class {} }));
vi.mock('electron', () => ({ powerMonitor: { isOnBatteryPower: vi.fn() } }));
vi.mock('./album-gains', () => ({ poolAlbumGains: vi.fn() }));
vi.mock('./loudness-window', () => ({ createLoudnessWindow: vi.fn() }));
vi.mock('../../repositories/loudness-repository', () => ({
  findTracksToMeasure: vi.fn(),
  findTracksToMeasureAmong: vi.fn(),
  getLoudnessProgress: vi.fn(),
  saveTrackLoudness: vi.fn(),
}));
vi.mock('../../repositories/library-repository', () => ({ getFolders: vi.fn() }));
vi.mock('../../repositories/settings-repository', () => ({ getSettings: vi.fn() }));
vi.mock('../mounts/mount-guard', () => ({ mountGuard: vi.fn() }));
// the queue is the one of the app, which the source is put on; the tests ask the source what it would do, and what its tasks do
vi.mock('../tasks/background-queue', () => ({
  scanKind: 'scan',
  backgroundQueue: { addSource: vi.fn(), enqueue: vi.fn(), dequeue: vi.fn(), isBusy: vi.fn(), idleFor: vi.fn(), refresh: vi.fn(), onChange: vi.fn() },
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
  let measure: Mock<(path: string, duration?: number) => Promise<Measurement>>;
  let close: Mock<() => void>;
  let isReadable: Mock<(mount: string, file: string) => Promise<boolean>>;
  let onStatus: Mock<(status: LoudnessProgress) => void>;
  let removeSource: Mock<() => boolean>;
  let stopWatching: Mock<() => boolean>;
  let source: TaskSource;
  let loudness: ReturnType<typeof registerLoudness>;
  /** What the library holds to be measured, and what was stored: a track that was stored is not asked for again, as the query leaves it out */
  let library: TrackToMeasure[];
  let stored: TrackLoudness[];
  const signal = new AbortController().signal;
  const measured: Measurement = { id: 1, outcome: 'measured', analysis, trackGain: -6, trackPeak: 1.2 };
  const elapse = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const register = () => {
    loudness = registerLoudness(database, 'tunelle://app/loudness.html', onStatus);
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
    measure = vi.fn<(path: string, duration?: number) => Promise<Measurement>>().mockResolvedValue(measured);
    close = vi.fn<() => void>();
    removeSource = vi.fn<() => boolean>().mockReturnValue(true);
    stopWatching = vi.fn<() => boolean>().mockReturnValue(true);
    onStatus = vi.fn<(status: LoudnessProgress) => void>();
    vi.mocked(createLoudnessWindow).mockReturnValue({ measure, close });
    isReadable = vi.fn<(mount: string, file: string) => Promise<boolean>>().mockResolvedValue(true);
    vi.mocked(mountGuard).mockReturnValue({
      isReadable,
      isEmpty: async () => false,
      readTime: async () => undefined,
      list: async () => ({ readable: false }),
      close: vi.fn<() => void>(),
    });
    vi.mocked(backgroundQueue.addSource).mockReset().mockReturnValue(removeSource);
    vi.mocked(backgroundQueue.isBusy).mockReset().mockReturnValue(false);
    vi.mocked(backgroundQueue.onChange).mockReset().mockReturnValue(stopWatching);
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
    vi.mocked(findTracksToMeasureAmong)
      .mockReset()
      .mockImplementation(async (_database, paths) => library.filter((found) => paths.includes(found.path) && !stored.some((row) => row.path === found.path)));
    vi.mocked(saveTrackLoudness)
      .mockReset()
      .mockImplementation(async (_database, row) => {
        stored.push(row);
        return [];
      });
    vi.mocked(backgroundQueue.enqueue).mockReset();
    vi.mocked(poolAlbumGains).mockReset().mockResolvedValue(0);
    // the counts of the library as they are: a track is measured once it is stored, as the file the library had
    vi.mocked(getLoudnessProgress)
      .mockReset()
      .mockImplementation(async () => ({
        total: library.length,
        measured: stored.filter((row) => row.status === 'measured').length,
        failed: stored.filter((row) => row.status === 'failed').length,
      }));
    vi.mocked(getFolders).mockReset().mockResolvedValue([]);
    vi.mocked(getSettings).mockReset().mockResolvedValue(undefined);
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

      expect(measure).toHaveBeenCalledWith('/music/a.flac', 200);
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

    it('leaves the tracks on a drive that does not answer, asking each mount about its own files, and measures the others', async () => {
      vi.mocked(getFolders).mockResolvedValue([
        { path: '/mnt/away', lastModified: 0 },
        { path: '/mnt/here', lastModified: 0 },
      ]);
      isReadable.mockImplementation(async (mount) => mount !== '/mnt/away');
      library = [track('/mnt/away/a.flac'), track('/mnt/here/b.flac')];
      register();
      await drain();

      expect(isReadable.mock.calls).toEqual([
        ['/mnt/away', '/mnt/away/a.flac'],
        ['/mnt/here', '/mnt/here/b.flac'],
      ]);
      expect(measure.mock.calls.map(([file]) => file)).toEqual(['/mnt/here/b.flac']);
      expect(stored).toEqual([expect.objectContaining({ path: '/mnt/here/b.flac' })]);
    });
  });

  describe('the tracks that are queued or play', () => {
    const queued = () =>
      vi
        .mocked(backgroundQueue.enqueue)
        .mock.calls.map(([task]) => task)
        .filter((task) => task.key.startsWith('/music/'));

    it('are put on the queue as tasks of their own, in the order given, with the same priority and conditions as the pass', async () => {
      library = ['a', 'b', 'c'].map((name) => track(`/music/${name}.flac`));
      register();

      await loudness.prioritise(['/music/c.flac', '/music/a.flac']);

      expect(queued()).toEqual([
        expect.objectContaining({ kind: 'loudness', key: '/music/c.flac', priority: 1, canRun: source.canRun }),
        expect.objectContaining({ kind: 'loudness', key: '/music/a.flac', priority: 1 }),
      ]);
    });

    it('are not counted twice among the tracks that wait, as the queue counts their tasks', async () => {
      library = ['a', 'b', 'c'].map((name) => track(`/music/${name}.flac`));
      register();
      await loudness.restart();

      await loudness.prioritise(['/music/c.flac']);

      expect(source.pending?.()).toBe(2);
    });

    it('measure the track and store it', async () => {
      library = [track('/music/a.flac')];
      register();
      await loudness.prioritise(['/music/a.flac']);

      await queued()[0].run(signal);

      expect(measure).toHaveBeenCalledWith('/music/a.flac', 200);
      expect(stored.map((row) => row.path)).toEqual(['/music/a.flac']);
    });

    it('are left out of the pass while they wait for their own task', async () => {
      library = ['a', 'b'].map((name) => track(`/music/${name}.flac`));
      register();
      await loudness.prioritise(['/music/a.flac']);

      expect((await source.next())?.key).toBe('/music/b.flac');
      expect(await source.next()).toBeUndefined();
    });

    it('queue nothing for tracks that are measured or not in the library, and nothing while the measurement is off', async () => {
      library = [track('/music/a.flac')];
      register();
      await loudness.prioritise(['/music/other.flac']);
      expect(queued()).toEqual([]);

      vi.mocked(getSettings).mockResolvedValue({ measureLoudness: false });
      await loudness.prioritise(['/music/a.flac']);
      expect(queued()).toEqual([]);
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

    describe('after a track', () => {
      /** A measurement that takes this long on the clock of the test */
      const takes = (ms: number) =>
        measure.mockImplementation(async () => {
          elapse(ms);
          return measured;
        });

      const measureOne = async () => {
        library = [track('/music/a.flac')];
        register();
        const task = await source.next();
        await task?.run(signal);
      };

      it('rests as long as the measurement took, and then goes on', async () => {
        takes(4000);
        await measureOne();

        expect(await canRun()).toBe(false);
        elapse(3999);
        expect(await canRun()).toBe(false);
        elapse(1);
        expect(await canRun()).toBe(true);
      });

      it('rests at most 30 s, however long the measurement took', async () => {
        takes(120_000);
        await measureOne();

        elapse(29_999);
        expect(await canRun()).toBe(false);
        elapse(1);
        expect(await canRun()).toBe(true);
      });

      it('rests also after a measurement that gave no row, as the work was done', async () => {
        measure.mockImplementation(async () => {
          elapse(2000);
          return { outcome: 'unavailable' };
        });
        await measureOne();

        expect(await canRun()).toBe(false);
        elapse(2000);
        expect(await canRun()).toBe(true);
      });
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
      ['too-large', { id: 1, outcome: 'too-large' }],
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

    describe('a measurement that times out', () => {
      const timeout: Measurement = { outcome: 'timeout' };

      /** One pass over the library, after the rest that follows the one before */
      const pass = async () => {
        elapse(rest + 1);
        await drain();
      };

      it('is tried again after the rest, and stored as failed when it timed out three times in a row', async () => {
        library = [track('/music/a.flac')];
        measure.mockResolvedValue(timeout);
        register();

        await drain();
        await pass();
        expect(measure).toHaveBeenCalledTimes(2);
        expect(stored).toEqual([]);
        await pass();

        expect(measure).toHaveBeenCalledTimes(3);
        expect(stored).toEqual([expect.objectContaining({ status: 'failed', reason: 'timeout', analysis: null })]);
        await pass();
        expect(measure).toHaveBeenCalledTimes(3);
      });

      it('starts the count again after a measurement that went through', async () => {
        library = [track('/music/a.flac')];
        measure
          .mockResolvedValueOnce(timeout)
          .mockResolvedValueOnce(timeout)
          .mockResolvedValueOnce({ id: 1, outcome: 'unreadable' })
          .mockResolvedValue(timeout);
        register();

        // two timeouts, an unreadable file, and two more timeouts: never three in a row
        await drain();
        for (let more = 0; more < 4; more++) await pass();

        expect(measure).toHaveBeenCalledTimes(5);
        expect(stored).toEqual([]);
      });

      it('does not count a page that did not load', async () => {
        library = [track('/music/a.flac')];
        measure.mockResolvedValue({ outcome: 'unavailable' });
        register();

        await drain();
        for (let more = 0; more < 3; more++) await pass();

        expect(measure).toHaveBeenCalledTimes(4);
        expect(stored).toEqual([]);
      });
    });

    it('gives the window the length of the track, which decodes a long one in pieces', async () => {
      library = [track('/music/mix.flac', { duration: 7200 })];
      register();
      await drain();

      expect(measure).toHaveBeenCalledWith('/music/mix.flac', 7200);
    });

    it('stores the stat of the file as the library had it, so a file that changes meanwhile is measured again', async () => {
      library = [track('/music/a.flac', { fileModified: 555, fileSize: 777 })];
      register();
      await drain();

      expect(stored).toEqual([expect.objectContaining({ fileModified: 555, fileSize: 777 })]);
    });

    it('looks for new tracks as soon as a scan has ended, not after the rest of the pass', async () => {
      register();
      await drain();
      expect(measure).not.toHaveBeenCalled();

      library = [track('/music/new.flac')];
      elapse(35_000);
      vi.mocked(backgroundQueue.idleFor).mockReturnValue(32_000);
      expect(await canRun()).toBe(true);
      await drain();

      expect(measure).toHaveBeenCalledWith('/music/new.flac', 200);
    });

    it('finds the tracks that a scan adds later, after the rest', async () => {
      register();
      await drain();
      expect(measure).not.toHaveBeenCalled();

      library = [track('/music/new.flac')];
      expect(await canRun()).toBe(false);
      elapse(rest + 1);
      await drain();

      expect(measure).toHaveBeenCalledWith('/music/new.flac', 200);
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

      expect(pooling()).toEqual([expect.objectContaining({ kind: 'loudness-pool', key: 'album-gains', priority: 1 })]);
      await lastPooling().run(signal);
      expect(poolAlbumGains).toHaveBeenCalledWith(database, signal);
    });

    it('tell the window how far the measurement is when they are pooled, as the page asks again for the song that plays', async () => {
      library = [track('/music/a.flac')];
      register();
      onStatus.mockClear();

      await lastPooling().run(signal);

      expect(onStatus).toHaveBeenCalledExactlyOnceWith({ total: 1, measured: 0, failed: 0 });
    });

    it('still tell it when the pooling fails, which is logged', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.mocked(poolAlbumGains).mockRejectedValue(new Error('locked'));
      register();
      onStatus.mockClear();

      await lastPooling().run(signal);

      expect(onStatus).toHaveBeenCalledTimes(1);
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

  describe('how far it is', () => {
    it('tells how many tracks are measured and how many failed, at most every 2 s while it measures, and at the end of the library', async () => {
      library = ['a', 'b', 'c'].map((name) => track(`/music/${name}.flac`));
      measure.mockResolvedValueOnce(measured).mockResolvedValueOnce({ id: 2, outcome: 'undecodable' }).mockResolvedValue(measured);
      register();
      await drain();

      expect(onStatus).toHaveBeenLastCalledWith({ total: 3, measured: 2, failed: 1 });
      expect(onStatus).toHaveBeenCalledTimes(2);
    });

    it('has the tracks that are not measured pending for the queue, and none while it is off or rests', async () => {
      library = ['a', 'b', 'c'].map((name) => track(`/music/${name}.flac`));
      register();
      await loudness.restart();
      expect(source.pending?.()).toBe(3);
      expect(backgroundQueue.refresh).toHaveBeenCalled();

      vi.mocked(getSettings).mockResolvedValue({ measureLoudness: false });
      await canRun();
      expect(source.pending?.()).toBe(0);

      vi.mocked(getSettings).mockResolvedValue({ measureLoudness: true });
      await canRun();
      expect(source.pending?.()).toBe(3);
      await drain();
      expect(source.pending?.()).toBe(0);
    });

    it('counts the pending tracks down as each is stored, without waiting for the counts of the library', async () => {
      library = ['a', 'b', 'c'].map((name) => track(`/music/${name}.flac`));
      register();
      await loudness.restart();
      vi.mocked(backgroundQueue.refresh).mockClear();
      vi.mocked(getLoudnessProgress).mockClear();

      const first = await source.next();
      await first?.run(signal);

      expect(source.pending?.()).toBe(2);
      expect(backgroundQueue.refresh).toHaveBeenCalled();
      expect(getLoudnessProgress).not.toHaveBeenCalled();
    });

    it('stops counting the pending tracks as soon as the settings are saved with the measurement off, not when it is next asked to run', async () => {
      library = [track('/music/a.flac')];
      register();
      await loudness.restart();
      vi.mocked(backgroundQueue.refresh).mockClear();

      vi.mocked(getSettings).mockResolvedValue({ measureLoudness: false });
      await loudness.checkSetting();

      expect(source.pending?.()).toBe(0);
      expect(backgroundQueue.refresh).toHaveBeenCalledOnce();
    });

    it('answers on request with what the library holds', async () => {
      library = [track('/music/a.flac')];
      register();
      await drain();

      expect(await loudness.status()).toEqual({ total: 1, measured: 1, failed: 0 });
      expect(getLoudnessProgress).toHaveBeenLastCalledWith(database, analysisVersion);
    });

    it('does not stop measuring when the counts cannot be read', async () => {
      library = [track('/music/a.flac')];
      vi.mocked(getLoudnessProgress).mockRejectedValue(new Error('database is locked'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      register();
      await drain();

      expect(stored).toHaveLength(1);
      expect(error).toHaveBeenCalledWith('Reading how far the loudness measurement is failed', expect.any(Error));
    });

    it('starts over from the first track after the measurements were cleared, and tells the counts', async () => {
      library = [track('/music/a.flac')];
      register();
      await drain();
      expect(measure).toHaveBeenCalledTimes(1);

      const pooled = () => vi.mocked(backgroundQueue.enqueue).mock.calls.filter(([task]) => task.key === 'album-gains').length;
      const pooledBefore = pooled();
      stored = [];
      await loudness.restart();
      expect(await canRun()).toBe(true);
      await drain();

      expect(measure).toHaveBeenCalledTimes(2);
      expect(onStatus).toHaveBeenCalledWith({ total: 1, measured: 0, failed: 0 });
      expect(pooled()).toBeGreaterThan(pooledBefore);
    });
  });

  describe('the end of a scan', () => {
    const scanChange = () => {
      const listener = vi.mocked(backgroundQueue.onChange).mock.calls.at(-1)?.[0];
      if (!listener) throw new Error('The queue is not watched');
      return listener;
    };
    const waitForStatus = () => vi.waitFor(() => expect(onStatus).toHaveBeenCalled());

    it('tells the settings how far the measurement is, as tracks were added or taken away', async () => {
      vi.mocked(getLoudnessProgress).mockResolvedValue({ total: 5, measured: 0, failed: 0 });
      register();
      onStatus.mockClear();

      vi.mocked(backgroundQueue.isBusy).mockReturnValue(true);
      scanChange()();
      expect(onStatus).not.toHaveBeenCalled();

      vi.mocked(backgroundQueue.isBusy).mockReturnValue(false);
      scanChange()();
      await waitForStatus();

      expect(onStatus).toHaveBeenCalledExactlyOnceWith({ total: 5, measured: 0, failed: 0 });
    });

    it('is not a reason to tell them when no scan ran', () => {
      register();
      onStatus.mockClear();

      scanChange()();
      scanChange()();

      expect(onStatus).not.toHaveBeenCalled();
    });
  });

  it('takes itself off the queue, takes its pooling off it and closes its window and the checks of the drives when it stops', () => {
    register();
    loudness.stop();

    expect(removeSource).toHaveBeenCalledTimes(1);
    expect(stopWatching).toHaveBeenCalledTimes(1);
    expect(backgroundQueue.dequeue).toHaveBeenCalledWith('album-gains');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
