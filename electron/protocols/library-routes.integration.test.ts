import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import addTrack from '../library/scan/add-track';
import { libraryRoutes } from './library-routes';
import { saveTrackLoudness } from '../repositories/loudness-repository';
import { analysisVersion } from '@shared/constants/loudness';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import executeQuery from '../database/execute-query';
import { createTestDatabase } from '../test-database';
import type { Track } from '@shared/types/library';

const track = (file: string, values: Partial<Track>): Track => ({
  path: file,
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
  ...values,
});

describe('library routes for browsing', () => {
  let database: Database;
  const answer = (route: string, query: string) => libraryRoutes[route](database, new URLSearchParams(query));

  beforeEach(async () => {
    database = await createTestDatabase();
    await addTrack(database, track('/m/a/1.flac', { artist: 'Adam', album: 'One', genre: 'Rock' }));
    await addTrack(database, track('/m/b/1.flac', { artist: 'Bea', album: 'Two', genre: 'Pop' }));
  });

  it('answers with the cover of one group, none for a name without tracks, and refuses a request without a kind or a key', async () => {
    await addTrack(database, track('/m/a/2.flac', { artist: 'Adam', album: 'One', picture: 'one.png' }));
    await executeQuery(database, { query: "INSERT INTO artist_photos (key, picture, checkedAt) VALUES ('bea', 'artist-bea.jpg', 1)", variables: [] });

    expect(await (await answer('/library/group-cover', 'by=artist&key=adam')).json()).toEqual({ cover: 'one.png' });
    expect(await (await answer('/library/group-cover', 'by=artist&key=bea')).json()).toEqual({ cover: 'artist-bea.jpg' });
    expect(await (await answer('/library/group-cover', 'by=artist&key=nobody')).json()).toEqual({ cover: null });
    expect((await answer('/library/group-cover', 'by=artist')).status).toBe(400);
    expect((await answer('/library/group-cover', 'key=adam')).status).toBe(400);
  });

  it('lists the groups of a kind with a sort and a filter', async () => {
    const response = await answer('/library/groups', 'by=artist&sort=trackCount&dir=desc&q=be');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, items: [{ key: 'bea', name: 'Bea', albumCount: 1, trackCount: 1 }] });
  });

  it('refuses a kind or a sort that is not known', async () => {
    expect((await answer('/library/groups', 'by=title')).status).toBe(400);
    expect((await answer('/library/groups', '')).status).toBe(400);
    expect((await answer('/library/groups', 'by=genre&sort=name&dir=up')).status).toBe(400);
  });

  it('limits the albums to a group, and refuses a group that is half given or of an unknown kind', async () => {
    const response = await answer('/library/albums', 'by=genre&group=rock');

    expect(await response.json()).toMatchObject({ total: 1, items: [{ title: 'One' }] });
    expect((await answer('/library/albums', 'by=genre')).status).toBe(400);
    expect((await answer('/library/albums', 'group=rock')).status).toBe(400);
    expect((await answer('/library/albums', 'by=path&group=rock')).status).toBe(400);
    expect(((await (await answer('/library/albums', '')).json()) as { total: number }).total).toBe(2);
  });

  it('gives the format and the loudness of one track, and not found for a track the library does not have', async () => {
    const found = await answer('/library/track', `path=${encodeURIComponent('/m/a/1.flac')}`);

    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ trackGain: null, albumGain: null });
    expect((await answer('/library/track', 'path=%2Fm%2Fnone.flac')).status).toBe(404);
    expect((await answer('/library/track', '')).status).toBe(400);
  });

  it('gives the analysis of a track that was measured, and not found for one that was not', async () => {
    const analysis: LoudnessAnalysis = {
      v: analysisVersion,
      sampleRate: 48000,
      channels: 2,
      integratedLufs: -12,
      loudnessRange: 5,
      samplePeak: 0.9,
      shortTerm: [-120],
      histogram: { bin: 0.1, counts: { '-121': 3 } },
    };
    await addTrack(database, track('/m/c/1.flac', { fileModified: 100, fileSize: 1000 }));
    await saveTrackLoudness(database, {
      path: '/m/c/1.flac',
      status: 'measured',
      trackGain: null,
      trackPeak: null,
      albumGain: null,
      albumPeak: null,
      albumTracks: null,
      fileModified: 100,
      fileSize: 1000,
      analysisVersion,
      reason: null,
      analysis,
    });

    const found = await answer('/library/loudness', `path=${encodeURIComponent('/m/c/1.flac')}`);

    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(analysis);
    expect((await answer('/library/loudness', `path=${encodeURIComponent('/m/b/1.flac')}`)).status).toBe(404);
    expect((await answer('/library/loudness', '')).status).toBe(400);
  });

  it('serves nothing before the database is connected', async () => {
    expect((await libraryRoutes['/library/groups'](undefined, new URLSearchParams('by=artist'))).status).toBe(403);
  });
});
