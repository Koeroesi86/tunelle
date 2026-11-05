import path from 'path';
import { describe, expect, it } from 'vitest';
import type { StoredFavourite } from '@shared/types/favourites';
import addTrack from './addTrack';
import { addFavourite, getFavourites } from '../repositories/favouritesRepository';
import { deleteTracksInside } from '../repositories/libraryRepository';
import { withAvailability } from './favouriteAvailability';
import { createTestDatabase } from '../test-database';

// the paths of the library use the separator of the platform
const musicFolder = path.join('/music');
const albumFolder = path.join(musicFolder, 'album');
const track = {
  path: path.join(albumFolder, 'a.flac'),
  artist: 'A',
  album: 'Album',
  title: 'One',
  year: '',
  track: '1',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
};

const favourite = (source: string, kind: string, id: string, snapshot: unknown = {}): StoredFavourite => ({ source, kind, id, snapshot, addedAt: 1 });

const availabilityOf = async (favourites: StoredFavourite[], findStations: (uuids: string[]) => Promise<{ uuid: string }[]> = async () => []) => {
  const database = await createTestDatabase();
  await addTrack(database, track);
  const result = await withAvailability(favourites, {
    database,
    radio: { findStations: async (uuids) => (await findStations(uuids)).map(({ uuid }) => ({ uuid }) as never) },
  });

  return result.map(({ available }) => available);
};

describe('withAvailability', () => {
  it('marks a local track available while it is in the library and unavailable when its file is gone', async () => {
    expect(await availabilityOf([favourite('local', 'track', track.path), favourite('local', 'track', '/music/moved.flac')])).toEqual([true, false]);
  });

  it('shows the format the library reads of a local track in its snapshot, and leaves the other snapshots as they are', async () => {
    const database = await createTestDatabase();
    await addTrack(database, { ...track, codec: 'FLAC', lossless: 1 });
    const album = { path: albumFolder, title: 'Album' };

    const result = await withAvailability(
      [
        favourite('local', 'track', track.path, { title: 'One' }),
        favourite('local', 'track', '/music/moved.flac', { title: 'Gone' }),
        favourite('local', 'album', 'a', album),
      ],
      { database, radio: { findStations: async () => [] } }
    );

    expect(result.map(({ snapshot }) => snapshot)).toEqual([
      {
        title: 'One',
        codec: 'FLAC',
        lossless: 1,
        bitDepth: null,
        sampleRate: null,
        bitrate: null,
        vbr: null,
        trackGain: null,
        albumGain: null,
        trackPeak: null,
        albumPeak: null,
      },
      { title: 'Gone' },
      album,
    ]);
  });

  it('marks a local album available while the library has tracks of it', async () => {
    const album = { path: albumFolder, title: 'Album' };

    expect(
      await availabilityOf([
        favourite('local', 'album', `${albumFolder} - Album`, album),
        favourite('local', 'album', '/gone - Album', { path: '/gone', title: 'Album' }),
        favourite('local', 'album', 'broken', { path: 1 }),
      ])
    ).toEqual([true, false, false]);
  });

  it('marks a station unavailable when the directory no longer lists it', async () => {
    expect(await availabilityOf([favourite('radio', 'station', 'abc'), favourite('radio', 'station', 'gone')], async () => [{ uuid: 'abc' }])).toEqual([
      true,
      false,
    ]);
  });

  it('keeps the stations available when the directory does not answer', async () => {
    expect(
      await availabilityOf([favourite('radio', 'station', 'abc')], async () => {
        throw new Error('offline');
      })
    ).toEqual([true]);
  });

  it('takes a favourite of a source it does not know as available', async () => {
    expect(await availabilityOf([favourite('drive:usb', 'track', '/mnt/usb/a.flac')])).toEqual([true]);
  });

  it('keeps the order of the favourites', async () => {
    expect(
      await availabilityOf([favourite('radio', 'station', 'gone'), favourite('local', 'track', track.path), favourite('radio', 'station', 'abc')], async () => [
        { uuid: 'abc' },
      ])
    ).toEqual([false, true, true]);
  });

  it('keeps the favourites of a folder that was removed from the library, as unavailable', async () => {
    const database = await createTestDatabase();
    await addTrack(database, track);
    await addFavourite(database, { source: 'local', kind: 'track', id: track.path }, track);

    await deleteTracksInside(database, musicFolder);
    const favourites = await withAvailability(await getFavourites(database), { database, radio: { findStations: async () => [] } });

    expect(favourites.map(({ id, available }) => ({ id, available }))).toEqual([{ id: track.path, available: false }]);
  });
});
