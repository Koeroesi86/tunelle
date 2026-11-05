import fs from 'fs';
import os from 'os';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Database } from 'sqlite3';
import { powerMonitor } from 'electron';
import type { Track } from '@shared/types/library';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import addTrack from '../scan/add-track';
import executeQuery from '../../database/execute-query';
import { createTestDatabase } from '../../test-database';
import { backgroundQueue, scanKind } from '../tasks/background-queue';
import { saveSettings } from '../../repositories/settings-repository';
import { saveFolders } from '../../repositories/library-repository';
import { setPlaying } from './playback-state';
import { createLoudnessWindow, type Measurement } from './loudness-window';
import { maxSeconds, registerLoudness } from './loudness-source';

vi.mock('electron', () => ({ powerMonitor: { isOnBatteryPower: vi.fn() } }));
vi.mock('./loudness-window', () => ({ createLoudnessWindow: vi.fn() }));

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

describe('the measurement of the loudness on the background queue', () => {
  let database: Database;
  let measure: Mock<(path: string) => Promise<Measurement>>;
  let close: Mock<() => void>;
  let source: ReturnType<typeof registerLoudness> | undefined;
  const idle = 30_000;
  const rows = () =>
    executeQuery<Row>(database, { query: 'SELECT path, status, reason, trackGain, trackPeak, analysis FROM track_loudness ORDER BY path', variables: [] });
  const measured: Measurement = { id: 1, outcome: 'measured', analysis, trackGain: -6, trackPeak: 1.2 };
  const register = () => {
    source = registerLoudness(database, 'tunelle://app/loudness.html');
  };
  // the database answers on the real clock, so each step of the queue is given a little real time between the steps of the fake one
  const settle = async () => {
    for (let turn = 0; turn < 5; turn++) {
      await sleep(2);
      await vi.advanceTimersByTimeAsync(0);
    }
  };
  // the queue rests between two looks and the source after a pass, so time is let pass in steps
  const elapse = async (ms: number) => {
    for (let passed = 0; passed < ms; passed += 1000) {
      await vi.advanceTimersByTimeAsync(Math.min(1000, ms - passed));
      await settle();
    }
  };

  beforeAll(() => {
    // the queue counts its idle time from the moment it was made, which is before the clock is faked
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'], now: Date.now() });
    backgroundQueue.start();
  });

  afterAll(async () => {
    await backgroundQueue.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    delete process.env.TUNELLE_LOUDNESS_IDLE_SECONDS;
    database = await createTestDatabase();
    measure = vi.fn<(path: string) => Promise<Measurement>>().mockResolvedValue(measured);
    close = vi.fn<() => void>();
    vi.mocked(createLoudnessWindow).mockReturnValue({ measure, close });
    vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(false);
    setPlaying(false);
    await elapse(idle);
  });

  afterEach(() => {
    source?.stop();
    source = undefined;
  });

  it('measures a track that has no gain tags, and keeps its gain, its peak and the analysis', async () => {
    await addTrack(database, track('/music/a.flac'));
    register();
    await elapse(5000);

    expect(measure).toHaveBeenCalledWith('/music/a.flac');
    expect(await rows()).toEqual([
      { path: '/music/a.flac', status: 'measured', reason: null, trackGain: -6, trackPeak: 1.2, analysis: JSON.stringify(analysis) },
    ]);
  });

  it('keeps the analysis of a track whose tags have the gain and the peak, and no gain of its own', async () => {
    await addTrack(database, track('/music/a.flac', { trackGain: -3, trackPeak: 0.9 }));
    register();
    await elapse(5000);

    expect(await rows()).toEqual([expect.objectContaining({ status: 'measured', trackGain: null, trackPeak: null, analysis: JSON.stringify(analysis) })]);
  });

  it('measures the peak of a track whose tags have a gain and no peak', async () => {
    await addTrack(database, track('/music/a.opus', { trackGain: -3 }));
    register();
    await elapse(5000);

    expect(await rows()).toEqual([expect.objectContaining({ trackGain: -6, trackPeak: 1.2 })]);
  });

  it('measures the tracks one after the other, in the order of their paths', async () => {
    await Promise.all(['/music/b.flac', '/music/a.flac', '/music/c.flac'].map((file) => addTrack(database, track(file))));
    register();
    await elapse(10_000);

    expect(measure.mock.calls.map(([file]) => file)).toEqual(['/music/a.flac', '/music/b.flac', '/music/c.flac']);
  });

  describe('what it waits for', () => {
    it('waits while a scan runs and for the idle time after it', async () => {
      await addTrack(database, track('/music/a.flac'));
      const end = backgroundQueue.begin(scanKind);
      register();
      await elapse(idle * 2);
      expect(measure).not.toHaveBeenCalled();

      end();
      await elapse(idle - 5000);
      expect(measure).not.toHaveBeenCalled();

      await elapse(10_000);
      expect(measure).toHaveBeenCalledTimes(1);
    });

    it('takes the idle time from TUNELLE_LOUDNESS_IDLE_SECONDS, and the default for what is not a number', async () => {
      process.env.TUNELLE_LOUDNESS_IDLE_SECONDS = '2';
      await addTrack(database, track('/music/a.flac'));
      backgroundQueue.begin(scanKind)();
      register();
      await elapse(5000);
      expect(measure).toHaveBeenCalledTimes(1);

      // the source rests after its pass, so the scan that moves the idle time starts at the end of the rest
      process.env.TUNELLE_LOUDNESS_IDLE_SECONDS = 'soon';
      await addTrack(database, track('/music/b.flac'));
      await elapse(55_000);
      backgroundQueue.begin(scanKind)();
      await elapse(20_000);
      expect(measure).toHaveBeenCalledTimes(1);

      await elapse(15_000);
      expect(measure).toHaveBeenCalledTimes(2);
    });

    it('waits while a track plays, and goes on when it stops', async () => {
      await addTrack(database, track('/music/a.flac'));
      setPlaying(true);
      register();
      await elapse(10_000);
      expect(measure).not.toHaveBeenCalled();

      setPlaying(false);
      await elapse(5000);

      expect(measure).toHaveBeenCalledTimes(1);
    });

    it('waits on battery', async () => {
      await addTrack(database, track('/music/a.flac'));
      vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(true);
      register();
      await elapse(10_000);
      expect(measure).not.toHaveBeenCalled();

      vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(false);
      await elapse(5000);

      expect(measure).toHaveBeenCalledTimes(1);
    });

    it('does not measure while the setting is off, and does when it is on or was never saved', async () => {
      await addTrack(database, track('/music/a.flac'));
      await saveSettings(database, { measureLoudness: false });
      register();
      await elapse(10_000);
      expect(measure).not.toHaveBeenCalled();

      await saveSettings(database, { measureLoudness: true });
      await elapse(5000);
      expect(measure).toHaveBeenCalledTimes(1);
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
      const gone = `${away.replace(/\\/g, '/')}/a.flac`;
      const there = `${here.replace(/\\/g, '/')}/b.flac`;
      await addTrack(database, track(gone));
      await addTrack(database, track(there));
      register();
      await elapse(10_000);

      expect(measure.mock.calls.map(([file]) => file)).toEqual([there]);
      fs.rmSync(away, { recursive: true, force: true });
      fs.rmSync(here, { recursive: true, force: true });
    });
  });

  describe('what it keeps', () => {
    it('stores a failure once, and does not try the track again', async () => {
      await addTrack(database, track('/music/a.flac'));
      measure.mockResolvedValue({ id: 1, outcome: 'undecodable' });
      register();
      await elapse(5000);
      expect(await rows()).toEqual([expect.objectContaining({ status: 'failed', reason: 'undecodable', trackGain: null, analysis: null })]);

      await elapse(idle * 5);

      expect(measure).toHaveBeenCalledTimes(1);
    });

    it.each<[string, Measurement]>([
      ['silent', { id: 1, outcome: 'silent' }],
      ['crashed', { outcome: 'crashed' }],
    ])('stores a %s track as failed with the reason', async (outcome, result) => {
      await addTrack(database, track('/music/a.flac'));
      measure.mockResolvedValue(result);
      register();
      await elapse(5000);

      expect(await rows()).toEqual([expect.objectContaining({ status: 'failed', reason: outcome })]);
    });

    it('stores nothing for a track that could not be read or did not answer, and tries it after the rest', async () => {
      await addTrack(database, track('/music/a.flac'));
      measure.mockResolvedValue({ id: 1, outcome: 'unreadable' });
      register();
      await elapse(5000);
      expect(await rows()).toEqual([]);
      expect(measure).toHaveBeenCalledTimes(1);

      measure.mockResolvedValue(measured);
      await elapse(65_000);

      expect(measure).toHaveBeenCalledTimes(2);
      expect(await rows()).toEqual([expect.objectContaining({ status: 'measured' })]);
    });

    it('does not decode a track that is too long, and stores it as failed', async () => {
      await addTrack(database, track('/music/mix.flac', { duration: maxSeconds + 1 }));
      register();
      await elapse(5000);

      expect(measure).not.toHaveBeenCalled();
      expect(await rows()).toEqual([expect.objectContaining({ status: 'failed', reason: 'too-large' })]);
    });

    it('measures a track again when its file changed, and when the version of the analysis rose', async () => {
      await addTrack(database, track('/music/a.flac'));
      register();
      await elapse(5000);
      expect(measure).toHaveBeenCalledTimes(1);

      await addTrack(database, track('/music/a.flac', { fileSize: 2000 }));
      await elapse(65_000);
      expect(measure).toHaveBeenCalledTimes(2);

      await executeQuery(database, { query: 'UPDATE track_loudness SET analysisVersion = ?', variables: [analysisVersion - 1] });
      await elapse(65_000);
      expect(measure).toHaveBeenCalledTimes(3);
    });

    it('finds the tracks that a scan adds later', async () => {
      register();
      await elapse(5000);
      expect(measure).not.toHaveBeenCalled();

      await addTrack(database, track('/music/new.flac'));
      await elapse(65_000);

      expect(measure).toHaveBeenCalledWith('/music/new.flac');
    });
  });

  it('takes itself off the queue and closes its window when it stops', async () => {
    await addTrack(database, track('/music/a.flac'));
    register();
    source?.stop();
    await elapse(10_000);

    expect(close).toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });
});
