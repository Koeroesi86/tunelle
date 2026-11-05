import { describe, expect, it } from 'vitest';
import type { Album, AlbumSummary, Track } from '../types/library';
import type { RadioStation } from '../types/radio';
import { albumFavourite, isFavourite, isFavourited, isSameFavourite, stationFavourite, trackFavourite } from './favourites';
import { toRadioTrack } from './utils/radio-track';

const track: Track = {
  path: '/music/a.flac',
  artist: 'A',
  album: 'Album',
  title: 'One',
  year: 2020,
  track: 1,
  disk: 1,
  genre: '',
  picture: null,
  duration: 10,
};
const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };
const summary: AlbumSummary = { id: '/music - Album', title: 'Album', path: '/music', artist: 'A', cover: null, duration: 20, year: 2020, trackCount: 2 };

describe('favourite keys', () => {
  it('keys a track of the library by its path', () => {
    expect(trackFavourite(track)).toEqual({ source: 'local', kind: 'track', id: '/music/a.flac', snapshot: track });
  });

  it('keys a radio track by the uuid of its station, with the station played last as the snapshot', () => {
    expect(trackFavourite(toRadioTrack(station), station)).toEqual(stationFavourite(station));
    expect(stationFavourite(station)).toMatchObject({ source: 'radio', kind: 'station', id: 'abc' });
  });

  it('falls back to what the radio track knows when another station was played last', () => {
    expect(trackFavourite(toRadioTrack(station), { ...station, uuid: 'other' })).toMatchObject({ id: 'abc', snapshot: { uuid: 'abc', name: 'Jazz FM' } });
  });

  it('keys an album by its id and snapshots it without the tracks', () => {
    const album: Album = { ...summary, tracks: [track, track] };
    const { trackCount: _trackCount, ...withoutCount } = summary;

    expect(albumFavourite(summary)).toEqual({ source: 'local', kind: 'album', id: '/music - Album', snapshot: summary });
    expect(albumFavourite(album).snapshot).toEqual({ ...withoutCount, trackCount: 2 });
  });

  it('tells the same favourite by source, kind and id', () => {
    const key = { source: 'local', kind: 'track', id: 'x' };

    expect(isSameFavourite(key, { ...key })).toBe(true);
    expect(
      [
        { ...key, source: 'drive:usb' },
        { ...key, kind: 'album' },
        { ...key, id: 'y' },
      ].some((other) => isSameFavourite(key, other))
    ).toBe(false);
  });

  it('finds a favourite in a list', () => {
    const favourites = [{ ...stationFavourite(station), addedAt: 1, available: true }];

    expect(isFavourited(favourites, { source: 'radio', kind: 'station', id: 'abc' })).toBe(true);
    expect(isFavourited(favourites, { source: 'local', kind: 'track', id: 'abc' })).toBe(false);
  });
});

describe('isFavourite', () => {
  const stored = { ...stationFavourite(station), addedAt: 1, available: true };

  it('accepts the favourites the player can show', () => {
    expect(
      [stored, { ...trackFavourite(track), addedAt: 1, available: false }, { ...albumFavourite(summary), addedAt: 1, available: true }].every(isFavourite)
    ).toBe(true);
  });

  it.each([
    ['another source', { ...stored, source: 'drive:usb' }],
    ['a snapshot without the station', { ...stored, snapshot: {} }],
    ['no snapshot', { ...stored, snapshot: null }],
    ['no availability', { ...stored, available: undefined }],
    ['no date', { ...stored, addedAt: 'now' }],
    ['text', 'favourite'],
    ['nothing', undefined],
  ])('refuses %s', (_name, value) => {
    expect(isFavourite(value)).toBe(false);
  });
});
