import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary, Track } from '@shared/types/library';
import type { Playlist } from '@shared/types/playlists';
import { getPlaylistTracks, getSourceTracks, toPlaylist } from './playlists';

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
const summary: AlbumSummary = { id: 'x', title: 'Album', path: '/music', artist: '', cover: null, duration: 2, year: 2020, trackCount: 2 };

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

describe('getSourceTracks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives a track as it is and the tracks of an album with its tracks', async () => {
    expect(await getSourceTracks(track('a'))).toEqual([track('a')]);
    expect(await getSourceTracks({ ...summary, tracks: [track('a'), track('b')] })).toHaveLength(2);
  });

  it('fetches the tracks of an album summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [track('a'), track('b')] }))
    );

    expect((await getSourceTracks(summary)).map(({ title }) => title)).toEqual(['a', 'b']);
  });
});
