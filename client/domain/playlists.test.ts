import { describe, expect, it } from 'vitest';
import type { Track } from '@shared/types/library';
import type { Playlist } from '@shared/types/playlists';
import { getPlaylistTracks, toPlaylist } from './playlists';

const track = (title: string): Track => ({
  path: `/music/${title}.flac`,
  artist: '',
  album: '',
  title,
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
});

describe('toPlaylist', () => {
  it('keeps a playlist with its tracks', () => {
    const message = { id: 1, name: 'Road', entries: [{ id: 5, track: track('a'), available: true }] };

    expect(toPlaylist(message)).toEqual([{ id: 1, name: 'Road', entries: [{ id: 5, track: track('a'), available: true }] }]);
  });

  it('leaves out an entry whose track the player cannot show', () => {
    const entries = [
      { id: 1, track: null, available: true },
      { id: 2, track: { path: 1 }, available: true },
      { id: 'x', track: track('a'), available: true },
      { id: 3, track: track('b'), available: false },
    ];

    expect(toPlaylist({ id: 1, name: 'Road', entries })[0].entries.map(({ id }) => id)).toEqual([3]);
  });

  it.each([{ id: '1', name: 'A', entries: [] }, { id: 1, name: 2, entries: [] }, { id: 1, name: 'A', entries: null }, null, 'text'])(
    'drops the malformed message %j',
    (message) => {
      expect(toPlaylist(message)).toEqual([]);
    }
  );
});

describe('getPlaylistTracks', () => {
  it('gives the tracks the library has, in the order of the playlist', () => {
    const playlist: Playlist = {
      id: 1,
      name: 'Road',
      entries: [
        { id: 1, track: track('a'), available: true },
        { id: 2, track: track('gone'), available: false },
        { id: 3, track: track('a'), available: true },
      ],
    };

    expect(getPlaylistTracks(playlist).map(({ title }) => title)).toEqual(['a', 'a']);
  });
});
