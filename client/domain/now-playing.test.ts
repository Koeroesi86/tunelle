import { describe, expect, it } from 'vitest';
import { splitStreamTitle, toNowPlaying } from './now-playing';
import { toRadioTrack } from './radio-track';
import { remoteKeyOf, toRemoteTrack } from './remote-track';

const station = toRadioTrack({ uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 });

describe('stream title', () => {
  it.each([
    ['Artist - Song', 'Artist', 'Song'],
    ['Artist - Song - Live', 'Artist', 'Song - Live'],
    ['  Artist  -  Song ', 'Artist', 'Song'],
    ['Just a title', '', 'Just a title'],
    ['Artist-Song', '', 'Artist-Song'],
    ['Artist - ', '', 'Artist -'],
  ])('splits %j', (streamTitle, artist, title) => {
    expect(splitStreamTitle(streamTitle)).toEqual({ artist, title });
  });
});

describe('now playing', () => {
  it('shows the song on air with the station as its album and the art found', () => {
    const { track, cover } = toNowPlaying(station, 'Artist - Song', 'abcd');

    expect(track).toMatchObject({ title: 'Song', artist: 'Artist', album: 'Jazz FM', picture: null });
    expect(cover).toBe('tunelle://app/radio-art/abcd');
  });

  it('shows the logo of the station while no art is found for the song', () => {
    expect(toNowPlaying(station, 'Artist - Song', null).cover).toBe('tunelle://app/radio-logo/abc');
  });

  it('shows the station without a cover when the stream sends no title', () => {
    expect(toNowPlaying(station, null, null).cover).toBeUndefined();
  });

  it('shows the station as it is when the stream sends no title', () => {
    expect(toNowPlaying(station, null, null)).toEqual({ track: station, cover: undefined });
  });

  it('shows a library track as it is, whatever title is left', () => {
    const track = { ...station, path: '/music/a.flac', picture: '/art/x.png' };

    expect(toNowPlaying(track, 'Artist - Song', null)).toEqual({ track, cover: 'tunelle://app/albumart/x-optimized.png' });
  });

  it('shows the cover of the host for a track of the host that has one, and none for one that has not', () => {
    const base = toRemoteTrack({ state: 'playing', title: 'Song', position: 0, at: 1 });
    const withCover = toRemoteTrack({ state: 'playing', title: 'Song', position: 0, at: 1, cover: true });

    expect(toNowPlaying(withCover, null, null).cover).toBe(`tunelle://app/remote/cover?t=${remoteKeyOf(withCover.path)}`);
    expect(toNowPlaying(base, null, null).cover).toBeUndefined();
  });
});
