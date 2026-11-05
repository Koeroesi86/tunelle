import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Favourite } from '@shared/types/favourites';
import type { Track } from '@shared/types/library';
import { albumFavourite, stationFavourite, trackFavourite } from './favourites';
import { getFavouriteTracks } from './favourite-tracks';
import { toRadioTrack } from './radio-track';

const track: Track = {
  path: '/music/a.flac',
  artist: 'A',
  album: 'Album',
  title: 'One',
  year: 2020,
  track: 1,
  disk: 1,
  genre: '',
  picture: 'file:///art.jpg',
  duration: 10,
};
const station = { uuid: 'abc', name: 'Jazz FM', country: '', tags: [], codec: '', bitrate: 0 };
const album = { id: '/music - Album', title: 'Album', path: '/music', artist: 'A', cover: null, duration: 20, year: 2020, trackCount: 1 };

const stored = (item: ReturnType<typeof trackFavourite>, available = true): Favourite => ({ ...item, addedAt: 1, available });

describe('getFavouriteTracks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives the track, the tracks of the album and the stream of the station, in order', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([track])));
    vi.stubGlobal('fetch', fetchMock);

    const tracks = await getFavouriteTracks([stored(stationFavourite(station)), stored(albumFavourite(album)), stored(trackFavourite(track))]);

    expect(tracks.map(({ path }) => path)).toEqual([toRadioTrack(station).path, track.path, track.path]);
    expect(fetchMock.mock.calls[0]).toEqual([expect.stringContaining('/library/album?path=%2Fmusic&title=Album')]);
  });

  it('leaves out what is not available, without asking the library for it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await getFavouriteTracks([stored(albumFavourite(album), false), stored(trackFavourite(track), false)])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
