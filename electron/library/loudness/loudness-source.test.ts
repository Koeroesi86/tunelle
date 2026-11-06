import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Database } from 'sqlite3';
import { powerMonitor } from 'electron';
import type { Track } from '@shared/types/library';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import addTrack from '../scan/add-track';
import executeQuery from '../../database/execute-query';
import { createTestDatabase } from '../../test-database';
import { backgroundQueue } from '../tasks/background-queue';
import type { TaskSource } from '../tasks/task-queue';
import { saveSettings } from '../../repositories/settings-repository';
import { saveFolders } from '../../repositories/library-repository';
import { setPlaying } from './playback-state';
import { createLoudnessWindow, type Measurement } from './loudness-window';
import { maxSeconds, registerLoudness } from './loudness-source';

vi.mock('electron', () => ({ powerMonitor: { isOnBatteryPower: vi.fn() } }));
vi.mock('./loudness-window', () => ({ createLoudnessWindow: vi.fn() }));
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

const track = (file: string, extra: Partial<Track> = {}): Track => ({
  path: file,
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 200,
  fileModified: 100,
  fileSize: 1000,
  ...extra,
});

type Row = { path: string; status: string; reason: string | null; trackGain: number | null; trackPeak: number | null; analysis: string | null };

const idle = 30_000;
const rest = 60_000;

describe('the measurement of the loudness as a source of the background queue', () => {
  let database: Database;
  let measure: Mock<(path: string) => Promise<Measurement>>;
  let close: Mock<() => void>;
  let removeSource: Mock<() => void>;
  let source: TaskSource;
  let loudness: ReturnType<typeof registerLoudness>;
  const signal = new AbortController().signal;
  const measured: Measurement = { id: 1, outcome: 'measured', analysis, trackGain: -6, trackPeak: 1.2 };
  const rows = () =>
    executeQuery<Row>(database, { query: 'SELECT path, status, reason, trackGain, trackPeak, analysis FROM track_loudness ORDER BY path', variables: [] });
  const elapse = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const register = () => {
    loudness = registerLoudness(database, 'tunelle://app/loudness.html');
    source = vi.mocked(backgroundQueue.addSource).mock.calls.at(-1)?.[0] as TaskSource;
  };
  const canRun = async () => (await source.canRun?.()) ?? true;
  /** The tasks of a pass over the library, run one after the other as the queue does, until the source has none */
  const drain = async () => {
    for (let task = await source.next(); task; task = await source.next()) await task.run(signal);
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    delete process.env.TUNELLE_LOUDNESS_IDLE_SECONDS;
    database = await createTestDatabase();
    measure = vi.fn<(path: string) => Promise<Measurement>>().mockResolvedValue(measured);
    close = vi.fn<() => void>();
    removeSource = vi.fn<() => void>();
    vi.mocked(createLoudnessWindow).mockReturnValue({ measure, close });
    vi.mocked(backgroundQueue.addSource).mockReset().mockReturnValue(removeSource);
    vi.mocked(backgroundQueue.isBusy).mockReset().mockReturnValue(false);
    vi.mocked(backgroundQueue.idleFor).mockReset().mockReturnValue(idle);
    vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(false);
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
      await addTrack(database, track('/music/a.flac'));
      register();
      await drain();

      expect(measure).toHaveBeenCalledWith('/music/a.flac');
      expect(await rows()).toEqual([
        { path: '/music/a.flac', status: 'measured', reason: null, trackGain: -6, trackPeak: 1.2, analysis: JSON.stringify(analysis) },
      ]);
    });

    it('keeps the analysis of a track whose tags have the gain and the peak, and no gain of its own', async () => {
      await addTrack(database, track('/music/a.flac', { trackGain: -3, trackPeak: 0.9 }));
      register();
      await drain();

      expect(await rows()).toEqual([expect.objectContaining({ status: 'measured', trackGain: null, trackPeak: null, analysis: JSON.stringify(analysis) })]);
    });

    it('measures the peak of a track whose tags have a gain and no peak', async () => {
      await addTrack(database, track('/music/a.opus', { trackGain: -3 }));
      register();
      await drain();

      expect(await rows()).toEqual([expect.objectContaining({ trackGain: -6, trackPeak: 1.2 })]);
    });

    it('gives the tracks one after the other, in the order of their paths, with the path as the key of the task', async () => {
      await Promise.all(['/music/b.flac', '/music/a.flac', '/music/c.flac'].map((file) => addTrack(database, track(file))));
      register();
      const keys: string[] = [];
      for (let task = await source.next(); task; task = await source.next()) {
        keys.push(task.key);
        await task.run(signal);
      }

      expect(keys).toEqual(['/music/a.flac', '/music/b.flac', '/music/c.flac']);
      expect(measure.mock.calls.map(([file]) => file)).toEqual(keys);
    });

    it('has no task for a library without tracks', async () => {
      register();

      expect(await source.next()).toBeUndefined();
    });

    it('does not store what a task that was told to stop measured', async () => {
      await addTrack(database, track('/music/a.flac'));
      register();
      const stopped = new AbortController();
      const task = await source.next();
      stopped.abort();
      await task?.run(stopped.signal);

      expect(await rows()).toEqual([]);
    });

    it('leaves the tracks of a folder that is away, and measures the others', async () => {
      const away = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-loudness-'));
      const here = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-loudness-'));
      fs.writeFileSync(path.join(here, 'b.flac'), '');
      // an empty folder that the library has tracks in is a drive that is not mounted
      await saveFolders(database, [
        { path: away, lastModified: 0 },
        { path: here, lastModified: 0 },
      ]);
      await addTrack(database, track(`${away.replace(/\\/g, '/')}/a.flac`));
      await addTrack(database, track(`${here.replace(/\\/g, '/')}/b.flac`));
      register();
      await drain();

      expect(measure.mock.calls.map(([file]) => file)).toEqual([`${here.replace(/\\/g, '/')}/b.flac`]);
      fs.rmSync(away, { recursive: true, force: true });
      fs.rmSync(here, { recursive: true, force: true });
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
      await saveSettings(database, { measureLoudness: false });
      expect(await canRun()).toBe(false);

      await saveSettings(database, { measureLoudness: true });
      expect(await canRun()).toBe(true);

      await saveSettings(database, { volume: 1 });
      expect(await canRun()).toBe(true);
    });
  });

  describe('what it keeps', () => {
    it('stores a failure once, and does not give the track again', async () => {
      await addTrack(database, track('/music/a.flac'));
      measure.mockResolvedValue({ id: 1, outcome: 'undecodable' });
      register();
      await drain();
      expect(await rows()).toEqual([expect.objectContaining({ status: 'failed', reason: 'undecodable', trackGain: null, analysis: null })]);

      elapse(rest + 1);
      await drain();

      expect(measure).toHaveBeenCalledTimes(1);
    });

    it.each<[string, Measurement]>([
      ['silent', { id: 1, outcome: 'silent' }],
      ['crashed', { outcome: 'crashed' }],
    ])('stores a track that is %s as failed with the reason', async (reason, result) => {
      await addTrack(database, track('/music/a.flac'));
      measure.mockResolvedValue(result);
      register();
      await drain();

      expect(await rows()).toEqual([expect.objectContaining({ status: 'failed', reason })]);
    });

    it('stores nothing for a track that could not be read or did not answer, and gives it again after the rest', async () => {
      await addTrack(database, track('/music/a.flac'));
      measure.mockResolvedValue({ id: 1, outcome: 'unreadable' });
      register();
      await drain();
      expect(await rows()).toEqual([]);
      expect(await canRun()).toBe(false);

      measure.mockResolvedValue(measured);
      elapse(rest + 1);
      expect(await canRun()).toBe(true);
      await drain();

      expect(measure).toHaveBeenCalledTimes(2);
      expect(await rows()).toEqual([expect.objectContaining({ status: 'measured' })]);
    });

    it('does not decode a track that is too long, and stores it as failed', async () => {
      await addTrack(database, track('/music/mix.flac', { duration: maxSeconds + 1 }));
      register();
      await drain();

      expect(measure).not.toHaveBeenCalled();
      expect(await rows()).toEqual([expect.objectContaining({ status: 'failed', reason: 'too-large' })]);
    });

    it('gives a track again when its file changed, and when the version of the analysis rose', async () => {
      await addTrack(database, track('/music/a.flac'));
      register();
      await drain();
      expect(measure).toHaveBeenCalledTimes(1);

      await addTrack(database, track('/music/a.flac', { fileSize: 2000 }));
      elapse(rest + 1);
      await drain();
      expect(measure).toHaveBeenCalledTimes(2);

      await executeQuery(database, { query: 'UPDATE track_loudness SET analysisVersion = ?', variables: [analysisVersion - 1] });
      elapse(rest + 1);
      await drain();
      expect(measure).toHaveBeenCalledTimes(3);
    });

    it('finds the tracks that a scan adds later, after the rest', async () => {
      register();
      await drain();
      expect(measure).not.toHaveBeenCalled();

      await addTrack(database, track('/music/new.flac'));
      expect(await canRun()).toBe(false);
      elapse(rest + 1);
      await drain();

      expect(measure).toHaveBeenCalledWith('/music/new.flac');
    });
  });

  it('takes itself off the queue and closes its window when it stops', () => {
    register();
    loudness.stop();

    expect(removeSource).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
