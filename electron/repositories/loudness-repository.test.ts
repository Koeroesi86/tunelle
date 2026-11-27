import { beforeEach, describe, expect, it, vi } from 'vitest';
import executeQuery from '../database/execute-query';
import executeQueries from '../database/execute-queries';
import { fakeDatabase } from '../test-fake-database';
import {
  clearTrackLoudness,
  findAlbumsToPool,
  findLoudnessAnalysis,
  findTracksToMeasure,
  findTracksToMeasureAmong,
  getAlbumAnalyses,
  getFailedLoudnessTracks,
  getLoudnessProgress,
  saveAlbumGain,
  saveTrackLoudness,
} from './loudness-repository';

vi.mock('../database/execute-query', () => ({ default: vi.fn() }));
vi.mock('../database/execute-queries', () => ({ default: vi.fn() }));

const database = fakeDatabase();
const versions = { analysisVersion: 4, appVersion: '26.11.30' };
const last = () => vi.mocked(executeQuery).mock.calls.at(-1)?.[1];
const row = {
  path: '/m/a.flac',
  status: 'measured' as const,
  trackGain: -3,
  trackPeak: 0.9,
  albumGain: null,
  albumPeak: null,
  albumTracks: null,
  fileModified: 1,
  fileSize: 2,
  analysisVersion: 4,
  reason: null,
  analysis: null,
  appVersion: null,
};

describe('the loudness repository', () => {
  beforeEach(() => {
    vi.mocked(executeQuery).mockReset().mockResolvedValue([]);
    vi.mocked(executeQueries).mockReset().mockResolvedValue([]);
  });

  it('stores a measurement with its analysis as text, and none as NULL', async () => {
    await saveTrackLoudness(database, row);
    await saveTrackLoudness(database, { ...row, analysis: { blocks: [] } as never });

    const [first, second] = vi.mocked(executeQuery).mock.calls.map(([, query]) => query.variables);
    expect(first).toEqual(['/m/a.flac', 'measured', -3, 0.9, null, null, null, 1, 2, 4, null, null, null]);
    expect(second.at(-2)).toBe('{"blocks":[]}');
  });

  it('finds no analysis for a track that has none, and reads the stored one back', async () => {
    expect(await findLoudnessAnalysis(database, '/m/a.flac', 4)).toBeUndefined();
    expect(last()?.variables).toEqual(['/m/a.flac', 4]);
  });

  it('asks for the tracks after a path in the order of their paths, with the version', async () => {
    await findTracksToMeasure(database, '/m/a', 50, versions);

    expect(last()?.variables).toEqual(['/m/a', 4, '26.11.30', 50]);
    expect(last()?.query).toContain('ORDER BY library.path ASC LIMIT ?');
  });

  it('asks for none among no paths, and for the given ones otherwise', async () => {
    expect(await findTracksToMeasureAmong(database, [], versions)).toEqual([]);
    expect(executeQuery).not.toHaveBeenCalled();

    await findTracksToMeasureAmong(database, ['/a', '/b'], versions);

    expect(last()?.variables).toEqual(['/a', '/b', 4, '26.11.30']);
    expect(last()?.query).toContain('IN (?, ?)');
  });

  it('says whether the tracks of an album are all analysed', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([
      { folder: '/m/a/', album: 'One', tracks: 3, analysed: 3, marked: 0, minPooled: -1, maxPooled: -1 },
      { folder: '/m/b/', album: 'Two', tracks: 3, analysed: 1, marked: 1, minPooled: 3, maxPooled: 3 },
    ]);

    expect(await findAlbumsToPool(database, 4)).toEqual([
      { folder: '/m/a/', album: 'One', tracks: 3, complete: true },
      { folder: '/m/b/', album: 'Two', tracks: 3, complete: false },
    ]);
    expect(last()?.variables).toEqual([4, 4]);
  });

  it('reads the analyses of an album by its folder and title', async () => {
    await getAlbumAnalyses(database, { folder: '/m/a/', album: 'One' }, 4);

    expect(last()?.variables).toEqual(['/m/a/', 'One', 4]);
  });

  it('stores the gain of an album on each track, and none as NULL', async () => {
    await saveAlbumGain(database, ['/a', '/b'], { albumGain: -5, albumPeak: 0.8 }, 2);
    await saveAlbumGain(database, ['/a'], undefined, 1);

    expect(vi.mocked(executeQueries).mock.calls.flatMap(([, queries]) => queries.map(({ variables }) => variables))).toEqual([
      [-5, 0.8, 2, '/a'],
      [-5, 0.8, 2, '/b'],
      [null, null, 1, '/a'],
    ]);
  });

  it('counts how far the measurement is, and lists the failures by the same rule', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([{ total: 4, measured: 3, failed: 1 }]);

    expect(await getLoudnessProgress(database, versions)).toEqual({ total: 4, measured: 3, failed: 1 });

    await getFailedLoudnessTracks(database, versions);
    expect(last()?.query).toContain("track_loudness.status = 'failed'");
    expect(last()?.variables).toEqual([4, '26.11.30']);
  });

  it('forgets every measurement', async () => {
    await clearTrackLoudness(database);

    expect(last()?.query).toBe('DELETE FROM track_loudness');
  });
});
