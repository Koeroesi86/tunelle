import { describe, expect, it } from 'vitest';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import { stationFavourite, trackFavourite } from './favourites';
import { isHistoryItem, isPlayingItem } from './history';
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
  picture: null,
  duration: 10,
};
const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };

describe('isHistoryItem', () => {
  const stored = { ...stationFavourite(station), playedAt: 1, available: true };

  it('accepts the items the player can show', () => {
    expect([stored, { ...trackFavourite(track), playedAt: 1, available: false }].every(isHistoryItem)).toBe(true);
  });

  it.each([
    ['another source', { ...stored, source: 'drive:usb' }],
    ['a snapshot without the station', { ...stored, snapshot: {} }],
    ['no availability', { ...stored, available: undefined }],
    ['no date', { ...stored, playedAt: 'now' }],
    ['a favourite', { ...stored, playedAt: undefined, addedAt: 1 }],
    ['text', 'item'],
    ['nothing', undefined],
  ])('refuses %s', (_name, value) => {
    expect(isHistoryItem(value)).toBe(false);
  });
});

describe('isPlayingItem', () => {
  const trackItem = { ...trackFavourite(track), playedAt: 1, available: true };
  const stationItem = { ...stationFavourite(station), playedAt: 1, available: true };

  it('is the track of the same path', () => {
    expect(isPlayingItem(trackItem, track)).toBe(true);
    expect(isPlayingItem(trackItem, { ...track, path: '/music/b.flac' })).toBe(false);
  });

  it('is the station of the radio track', () => {
    expect(isPlayingItem(stationItem, toRadioTrack(station))).toBe(true);
    expect(isPlayingItem(stationItem, toRadioTrack({ ...station, uuid: 'def' }))).toBe(false);
  });

  it('is nothing while nothing plays', () => {
    expect(isPlayingItem(trackItem, null)).toBe(false);
  });
});
