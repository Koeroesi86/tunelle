import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import type { LoudnessAnalysis, TrackLoudness } from '@shared/types/loudness';
import { poolAlbum } from '@shared/utils/pool-loudness';
import addTrack from '../scan/add-track';
import executeQuery from '../../database/execute-query';
import { createTestDatabase } from '../../test-database';
import { deleteTracks, findTrackFormat } from '../../repositories/library-repository';
import { saveTrackLoudness } from '../../repositories/loudness-repository';
import { poolAlbumGains } from './album-gains';

const analysisOf = (bin: number, samplePeak: number): LoudnessAnalysis => ({
  v: 1,
  sampleRate: 48000,
  channels: 2,
  integratedLufs: bin / 10,
  loudnessRange: 0,
  samplePeak,
  shortTerm: [bin],
  histogram: { bin: 0.1, counts: { [bin]: 100 } },
});

const track = (path: string, album: string | null, extra: Partial<Track> = {}): Track => ({
  path,
  artist: '',
  album: album ?? '',
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

const measured = (path: string, bin: number, peak: number, extra: Partial<TrackLoudness> = {}): TrackLoudness => ({
  path,
  status: 'measured',
  trackGain: null,
  trackPeak: null,
  albumGain: null,
  albumPeak: null,
  albumTracks: null,
  fileModified: 100,
  fileSize: 1000,
  analysisVersion: 1,
  reason: null,
  analysis: analysisOf(bin, peak),
  ...extra,
});

type Pooled = { path: string; albumGain: number | null; albumPeak: number | null; albumTracks: number | null };

describe('poolAlbumGains', () => {
  let database: Database;
  const signal = new AbortController().signal;
  const pooled = () =>
    executeQuery<Pooled>(database, { query: 'SELECT path, albumGain, albumPeak, albumTracks FROM track_loudness ORDER BY path', variables: [] });
  const add = async (path: string, album: string | null, bin: number, peak = 0.5, extra: Partial<TrackLoudness> = {}) => {
    await addTrack(database, track(path, album));
    await saveTrackLoudness(database, measured(path, bin, peak, extra));
  };
  const expectedGain = (...bins: number[]) => poolAlbum(bins.map((bin) => analysisOf(bin, 0.5)))?.albumGain;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  it('gives every track of an album the gain pooled from the analyses of all of them, and the highest peak', async () => {
    await add('/music/a/1.flac', 'One', -140, 0.4);
    await add('/music/a/2.flac', 'One', -200, 1.3);

    expect(await poolAlbumGains(database, signal)).toBe(1);

    const gain = expectedGain(-140, -200);
    expect(await pooled()).toEqual([
      { path: '/music/a/1.flac', albumGain: gain, albumPeak: 1.3, albumTracks: 2 },
      { path: '/music/a/2.flac', albumGain: gain, albumPeak: 1.3, albumTracks: 2 },
    ]);
  });

  it('keeps the albums apart by their folder and their title', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await add('/music/b/1.flac', 'One', -200);
    await add('/music/a/2.flac', 'Two', -260);

    expect(await poolAlbumGains(database, signal)).toBe(3);

    expect((await pooled()).map((row) => row.albumGain)).toEqual([expectedGain(-140), expectedGain(-260), expectedGain(-200)]);
  });

  it('leaves an album alone while one of its tracks has no analysis, or only a failed one', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await addTrack(database, track('/music/a/2.flac', 'One'));
    await add('/music/b/1.flac', 'Two', -140);
    await addTrack(database, track('/music/b/2.flac', 'Two'));
    await saveTrackLoudness(database, measured('/music/b/2.flac', -140, 0.5, { status: 'failed', reason: 'undecodable', analysis: null }));

    expect(await poolAlbumGains(database, signal)).toBe(0);
    expect((await pooled()).map((row) => row.albumGain)).toEqual([null, null, null]);
  });

  it('does not take the tracks of a folder without an album title for an album', async () => {
    await add('/music/singles/1.flac', null, -140);
    await add('/music/singles/2.flac', null, -200);

    expect(await poolAlbumGains(database, signal)).toBe(0);
  });

  it('has nothing to do for an album that is pooled, and does it again for a track that is measured again', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await add('/music/a/2.flac', 'One', -200);
    await poolAlbumGains(database, signal);
    expect(await poolAlbumGains(database, signal)).toBe(0);

    await saveTrackLoudness(database, measured('/music/a/2.flac', -260, 0.5));
    expect(await poolAlbumGains(database, signal)).toBe(1);

    expect((await pooled()).map((row) => row.albumGain)).toEqual([expectedGain(-140, -260), expectedGain(-140, -260)]);
  });

  it('pools an album again when a track is taken away, with the number of tracks it has now', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await add('/music/a/2.flac', 'One', -200);
    await add('/music/a/3.flac', 'One', -260);
    await poolAlbumGains(database, signal);

    await deleteTracks(database, [{ path: '/music/a/3.flac' }]);
    expect(await poolAlbumGains(database, signal)).toBe(1);

    expect(await pooled()).toEqual([
      expect.objectContaining({ path: '/music/a/1.flac', albumGain: expectedGain(-140, -200), albumTracks: 2 }),
      expect.objectContaining({ path: '/music/a/2.flac', albumGain: expectedGain(-140, -200), albumTracks: 2 }),
    ]);
  });

  it('takes the gain from an album that got a track with no analysis, so its tracks play at their own gain', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await add('/music/a/2.flac', 'One', -200);
    await poolAlbumGains(database, signal);

    await addTrack(database, track('/music/a/3.flac', 'One'));
    expect(await poolAlbumGains(database, signal)).toBe(1);

    expect(await pooled()).toEqual([
      { path: '/music/a/1.flac', albumGain: null, albumPeak: null, albumTracks: null },
      { path: '/music/a/2.flac', albumGain: null, albumPeak: null, albumTracks: null },
    ]);
  });

  it('marks an album that has no gain as pooled, so it is not looked at again', async () => {
    await add('/music/a/1.flac', 'One', -140, 0.5, { analysis: { ...analysisOf(-140, 0.5), histogram: { bin: 0.1, counts: {} } } });

    expect(await poolAlbumGains(database, signal)).toBe(1);
    expect(await pooled()).toEqual([{ path: '/music/a/1.flac', albumGain: null, albumPeak: null, albumTracks: 1 }]);
    expect(await poolAlbumGains(database, signal)).toBe(0);
  });

  it('does not count an analysis of a file that changed since, or of an older version', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await add('/music/a/2.flac', 'One', -200);
    await addTrack(database, track('/music/a/2.flac', 'One', { fileSize: 2000 }));
    expect(await poolAlbumGains(database, signal)).toBe(0);

    await addTrack(database, track('/music/a/2.flac', 'One'));
    await executeQuery(database, { query: 'UPDATE track_loudness SET analysisVersion = 0 WHERE path = ?', variables: ['/music/a/2.flac'] });
    expect(await poolAlbumGains(database, signal)).toBe(0);
  });

  it('stops between the albums when it is told to', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await add('/music/b/1.flac', 'Two', -140);
    const stopped = new AbortController();
    stopped.abort();

    expect(await poolAlbumGains(database, stopped.signal)).toBe(0);
  });

  it('is the album gain a track plays with, unless its tags have one', async () => {
    await add('/music/a/1.flac', 'One', -140);
    await addTrack(database, track('/music/a/2.flac', 'One', { albumGain: -3, albumPeak: 0.9 }));
    await saveTrackLoudness(database, measured('/music/a/2.flac', -200, 0.5));
    await poolAlbumGains(database, signal);

    expect(await findTrackFormat(database, '/music/a/1.flac')).toEqual(expect.objectContaining({ albumGain: expectedGain(-140, -200), albumPeak: 0.5 }));
    expect(await findTrackFormat(database, '/music/a/2.flac')).toEqual(expect.objectContaining({ albumGain: -3, albumPeak: 0.9 }));
  });
});
