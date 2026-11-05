import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import type { LoudnessAnalysis, TrackLoudness } from '@shared/types/loudness';
import { deleteTracks, deleteTracksInside, findTrackFormat, getAlbumTracks, getLibrary, getTrackPage } from './library-repository';
import { findLoudnessAnalysis, saveTrackLoudness } from './loudness-repository';
import addTrack from '../library/scan/add-track';
import executeQuery from '../database/execute-query';
import { createTestDatabase } from '../test-database';

const unsorted = { sort: undefined, folders: [] };

const track = (path: string, extra: Partial<Track> = {}): Track => ({
  path,
  artist: '',
  album: 'Album',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
  fileModified: 100,
  fileSize: 1000,
  ...extra,
});

const analysis: LoudnessAnalysis = {
  v: 1,
  sampleRate: 48000,
  channels: 2,
  integratedLufs: -12,
  loudnessRange: 5,
  samplePeak: 1.2,
  shortTerm: [-120, -118],
  histogram: { bin: 0.1, counts: { '-121': 3 } },
};

const measured = (path: string, extra: Partial<TrackLoudness> = {}): TrackLoudness => ({
  path,
  status: 'measured',
  trackGain: -6,
  trackPeak: 1.2,
  albumGain: -5,
  albumPeak: 1.3,
  integratedLufs: -12,
  loudnessRange: 5,
  fileModified: 100,
  fileSize: 1000,
  analysisVersion: 1,
  measuredAt: 1,
  reason: null,
  analysis,
  ...extra,
});

describe('loudnessRepository', () => {
  let database: Database;
  const gains = () => getLibrary(database, unsorted, ['path', 'trackGain', 'albumGain', 'trackPeak', 'albumPeak']);
  const rows = () =>
    executeQuery<{ path: string }>(database, { query: 'SELECT path FROM track_loudness ORDER BY path', variables: [] }).then((found) =>
      found.map((row) => row.path)
    );

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  describe('the loudness of a track in the queries', () => {
    it('is the measured one for a track without tags, in every query that lists a track', async () => {
      await addTrack(database, track('/music/a.flac'));
      await saveTrackLoudness(database, measured('/music/a.flac'));
      const expected = { trackGain: -6, albumGain: -5, trackPeak: 1.2, albumPeak: 1.3 };

      expect(await gains()).toEqual([{ path: '/music/a.flac', ...expected }]);
      expect((await getTrackPage(database, 0, 10, unsorted)).items[0]).toEqual(expect.objectContaining(expected));
      expect((await getAlbumTracks(database, '/music', 'Album', ['trackGain', 'trackPeak']))[0]).toEqual({ trackGain: -6, trackPeak: 1.2 });
      expect(await findTrackFormat(database, '/music/a.flac')).toEqual(expect.objectContaining(expected));
    });

    it('is the one of the tags when the tags have it, and the measured one for what they lack', async () => {
      await addTrack(database, track('/music/a.flac', { trackGain: -3, trackPeak: 0.9 }));
      await saveTrackLoudness(database, measured('/music/a.flac'));

      expect(await gains()).toEqual([{ path: '/music/a.flac', trackGain: -3, trackPeak: 0.9, albumGain: -5, albumPeak: 1.3 }]);
    });

    it('is nothing for a track that was not measured', async () => {
      await addTrack(database, track('/music/a.flac'));

      expect(await gains()).toEqual([{ path: '/music/a.flac', trackGain: null, trackPeak: null, albumGain: null, albumPeak: null }]);
    });

    it('ignores a measurement of a file that has changed since, by the modification time or by the size', async () => {
      await addTrack(database, track('/music/a.flac', { fileModified: 200 }));
      await addTrack(database, track('/music/b.flac', { fileSize: 2000 }));
      await Promise.all(['/music/a.flac', '/music/b.flac'].map((path) => saveTrackLoudness(database, measured(path))));

      expect((await gains()).map((item) => item.trackGain)).toEqual([null, null]);
    });

    it('keeps the measurement when the scan stores the track again with the same file', async () => {
      await addTrack(database, track('/music/a.flac'));
      await saveTrackLoudness(database, measured('/music/a.flac'));
      await addTrack(database, track('/music/a.flac', { title: 'Renamed' }));

      expect((await gains())[0].trackGain).toBe(-6);
    });

    it('is not a row of a failed measurement either way: it has no gain to give', async () => {
      await addTrack(database, track('/music/a.flac'));
      await saveTrackLoudness(
        database,
        measured('/music/a.flac', {
          status: 'failed',
          trackGain: null,
          trackPeak: null,
          albumGain: null,
          albumPeak: null,
          analysis: null,
          reason: 'unsupported',
        })
      );

      expect((await gains())[0].trackGain).toBeNull();
    });
  });

  describe('the analysis', () => {
    it('is read for a track as it is measured, with the numbers and the JSON kept', async () => {
      await addTrack(database, track('/music/a.flac'));
      await saveTrackLoudness(database, measured('/music/a.flac'));

      expect(await findLoudnessAnalysis(database, '/music/a.flac', 1)).toEqual(analysis);
    });

    it('replaces the row of a track that was measured before', async () => {
      await addTrack(database, track('/music/a.flac'));
      await saveTrackLoudness(database, measured('/music/a.flac'));
      await saveTrackLoudness(database, measured('/music/a.flac', { analysis: { ...analysis, integratedLufs: -9 } }));

      expect((await findLoudnessAnalysis(database, '/music/a.flac', 1))?.integratedLufs).toBe(-9);
      expect(await rows()).toEqual(['/music/a.flac']);
    });

    it('is not found for a failed row, a stale one, an older version or a track that is not in the library', async () => {
      await addTrack(database, track('/music/failed.flac'));
      await addTrack(database, track('/music/stale.flac', { fileSize: 5 }));
      await addTrack(database, track('/music/old.flac'));
      await saveTrackLoudness(database, measured('/music/failed.flac', { status: 'failed', analysis: null }));
      await saveTrackLoudness(database, measured('/music/stale.flac'));
      await saveTrackLoudness(database, measured('/music/old.flac', { analysisVersion: 0 }));
      await saveTrackLoudness(database, measured('/music/gone.flac'));

      const found = await Promise.all(['failed', 'stale', 'old', 'gone'].map((name) => findLoudnessAnalysis(database, `/music/${name}.flac`, 1)));

      expect(found).toEqual([undefined, undefined, undefined, undefined]);
    });
  });

  describe('removing tracks', () => {
    it('removes the rows with the tracks, by path and by folder', async () => {
      await Promise.all(['/music/a/1.flac', '/music/a/2.flac', '/music/b/1.flac'].map((path) => addTrack(database, track(path))));
      await Promise.all(['/music/a/1.flac', '/music/a/2.flac', '/music/b/1.flac'].map((path) => saveTrackLoudness(database, measured(path))));

      await deleteTracks(database, [{ path: '/music/a/1.flac' }]);
      expect(await rows()).toEqual(['/music/a/2.flac', '/music/b/1.flac']);

      await deleteTracksInside(database, '/music/a');
      expect(await rows()).toEqual(['/music/b/1.flac']);
    });
  });
});
