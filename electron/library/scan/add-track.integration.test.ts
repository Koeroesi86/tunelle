import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import addTrack from './add-track';
import executeQuery from '../../database/execute-query';
import { createTestDatabase } from '../../test-database';

const track: Track = {
  path: '/music/album/01.flac',
  artist: 'Artist',
  album: 'Album',
  title: 'Title',
  year: 2020,
  track: 1,
  disk: 1,
  genre: 'Rock',
  picture: 'cover.jpg',
  duration: 123.5,
};

const selectLibrary = (database: Database) => executeQuery<Track>(database, { query: 'SELECT * FROM library ORDER BY path', variables: [] });

describe('addTrack', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('stores every field of the track', async () => {
    await addTrack(database, track);

    const [stored] = await selectLibrary(database);
    expect(stored).toMatchObject({
      path: track.path,
      artist: 'Artist',
      album: 'Album',
      title: 'Title',
      genre: 'Rock',
      picture: 'cover.jpg',
      duration: 123.5,
    });
    expect(`${stored.year}`).toBe('2020');
  });

  it('stores the keys the title, the artist and the album are sorted by', async () => {
    await addTrack(database, { ...track, title: 'Ékes', artist: 'Őrs', album: '' });

    const [stored] = await executeQuery<{ title_key: string; artist_key: string; album_key: string }>(database, {
      query: 'SELECT title_key, artist_key, album_key FROM library',
      variables: [],
    });
    expect(stored).toEqual({ title_key: 'ekes', artist_key: 'ors', album_key: '' });
  });

  it('stores the audio format of the track', async () => {
    const format = { codec: 'FLAC', bitDepth: 24, sampleRate: 96000, bitrate: 2800000, vbr: null, lossless: 1 };
    await addTrack(database, { ...track, ...format });

    const [stored] = await selectLibrary(database);
    expect(stored).toMatchObject(format);
  });

  it('leaves the audio format empty for a track without one', async () => {
    await addTrack(database, track);

    const [stored] = await selectLibrary(database);
    expect(stored).toMatchObject({ codec: null, bitDepth: null, sampleRate: null, bitrate: null, vbr: null, lossless: null });
  });

  it('stores the loudness of the track, and none for a track without tags', async () => {
    const loudness = { trackGain: -6.5, albumGain: -8, trackPeak: 0.9, albumPeak: 0.99 };
    await addTrack(database, { ...track, ...loudness });
    await addTrack(database, { ...track, path: '/music/other.mp3' });

    const [withTags, without] = await executeQuery<Record<string, unknown>>(database, {
      query: 'SELECT trackGain, albumGain, trackPeak, albumPeak FROM library ORDER BY path',
      variables: [],
    });
    expect(withTags).toEqual(loudness);
    expect(without).toEqual({ trackGain: null, albumGain: null, trackPeak: null, albumPeak: null });
  });

  it('replaces an existing track with the same path', async () => {
    await addTrack(database, track);
    await addTrack(database, { ...track, title: 'Renamed' });

    const library = await selectLibrary(database);
    expect(library).toHaveLength(1);
    expect(library[0].title).toBe('Renamed');
  });

  it('accepts a track without picture and duration', async () => {
    await addTrack(database, { ...track, picture: null, duration: null });

    const [stored] = await selectLibrary(database);
    expect(stored.picture).toBeNull();
    expect(stored.duration).toBeNull();
  });
});
