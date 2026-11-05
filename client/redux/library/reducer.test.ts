import { describe, expect, it } from 'vitest';
import type { AlbumSummary, Track } from '@shared/types/library';
import reducer from './reducer';
import type { LibraryState } from './reducer';

const createTrack = (path: string): Track => ({
  path,
  artist: 'Artist',
  album: 'Album',
  title: path,
  year: 2020,
  track: 1,
  disk: 1,
  genre: 'Rock',
  picture: null,
  duration: 100,
});

const createAlbum = (id: string): AlbumSummary => ({ id, title: id, path: '/music', artist: 'Artist', cover: null, duration: 100, year: 2020, trackCount: 1 });

const storeTracks = (state: LibraryState | undefined, page: number, paths: string[], total: number) =>
  reducer(state, { type: 'STORE_TRACK_PAGE', payload: { page, items: paths.map(createTrack), total } });

describe('library reducer', () => {
  it('starts without pages and not loaded', () => {
    const state = reducer(undefined, { type: '@@INIT' });

    expect(state).toEqual({
      tracks: { total: undefined, pages: {}, stale: [] },
      albums: { total: undefined, pages: {}, stale: [] },
      groups: {
        artist: { total: undefined, pages: {}, stale: [] },
        albumArtist: { total: undefined, pages: {}, stale: [] },
        genre: { total: undefined, pages: {}, stale: [] },
      },
      groupAlbums: { total: undefined, pages: {}, stale: [] },
      loaded: false,
    });
  });

  it('stores pages of tracks and merges them, and is loaded with the first page', () => {
    const state = storeTracks(storeTracks(undefined, 0, ['/a'], 150), 1, ['/b'], 150);

    expect(state.loaded).toBe(true);
    expect(state.tracks.total).toBe(150);
    expect(Object.keys(state.tracks.pages)).toEqual(['0', '1']);
    expect(state.tracks.pages[1].map((track) => track.path)).toEqual(['/b']);
  });

  it('stores pages of albums apart from the tracks', () => {
    const state = reducer(undefined, { type: 'STORE_ALBUM_PAGE', payload: { page: 0, items: [createAlbum('one')], total: 1 } });

    expect(state.albums.pages[0].map((album) => album.id)).toEqual(['one']);
    expect(state.albums.total).toBe(1);
    expect(state.tracks.pages).toEqual({});
  });

  it('marks the cached pages stale on a change of the library, and keeps them to show', () => {
    const stored = storeTracks(storeTracks(undefined, 0, ['/a'], 150), 1, ['/b'], 150);
    const state = reducer(stored, { type: 'INVALIDATE_LIBRARY' });

    expect(state.tracks.stale).toEqual([0, 1]);
    expect(state.tracks.pages).toEqual(stored.tracks.pages);
  });

  it('replaces a stale page when it is fetched again, with the new total', () => {
    const stale = reducer(storeTracks(undefined, 0, ['/a', '/b'], 2), { type: 'INVALIDATE_LIBRARY' });
    const state = storeTracks(stale, 0, ['/a'], 1);

    expect(state.tracks.stale).toEqual([]);
    expect(state.tracks.total).toBe(1);
    expect(state.tracks.pages[0].map((track) => track.path)).toEqual(['/a']);
  });

  it('drops the pages of one list when it is reset, and keeps the other', () => {
    const stored = reducer(storeTracks(undefined, 0, ['/a'], 150), { type: 'STORE_ALBUM_PAGE', payload: { page: 0, items: [createAlbum('one')], total: 1 } });
    const state = reducer(stored, { type: 'RESET_LIBRARY', payload: { kind: 'tracks' } });

    expect(state.tracks).toEqual({ total: undefined, pages: {}, stale: [] });
    expect(state.albums).toBe(stored.albums);
    expect(state.loaded).toBe(true);
  });

  describe('artists, album artists and genres', () => {
    const group = { key: 'adam', name: 'Adam', albumCount: 1, trackCount: 2, cover: null, covers: [] };
    const storeGroups = (state: LibraryState | undefined, kind: 'artist' | 'albumArtist' | 'genre') =>
      reducer(state, { type: 'STORE_GROUP_PAGE', payload: { kind, page: 0, items: [group], total: 1 } });

    it('stores the pages of each kind apart, and the albums of the open one apart from the albums', () => {
      const state = reducer(storeGroups(undefined, 'genre'), {
        type: 'STORE_GROUP_ALBUM_PAGE',
        payload: { page: 0, items: [createAlbum('one')], total: 1 },
      });

      expect(state.groups.genre.pages[0]).toEqual([group]);
      expect(state.groups.artist.total).toBeUndefined();
      expect(state.groupAlbums.pages[0].map((album) => album.id)).toEqual(['one']);
      expect(state.albums.total).toBeUndefined();
    });

    it('drops the pages of one kind when it is reset, and the albums of the group when they are', () => {
      const stored = reducer(storeGroups(storeGroups(undefined, 'artist'), 'genre'), {
        type: 'STORE_GROUP_ALBUM_PAGE',
        payload: { page: 0, items: [createAlbum('one')], total: 1 },
      });
      const state = reducer(reducer(stored, { type: 'RESET_LIBRARY', payload: { kind: 'artist' } }), {
        type: 'RESET_LIBRARY',
        payload: { kind: 'groupAlbums' },
      });

      expect(state.groups.artist.total).toBeUndefined();
      expect(state.groups.genre).toBe(stored.groups.genre);
      expect(state.groupAlbums.total).toBeUndefined();
    });

    it('marks the pages of the artists and the album artists stale when their photos arrive, and not the genres', () => {
      const stored = storeGroups(storeGroups(storeGroups(undefined, 'artist'), 'albumArtist'), 'genre');
      const state = reducer(stored, { type: 'ARTIST_PHOTOS_READY' });

      expect(state.groups.artist.stale).toEqual([0]);
      expect(state.groups.albumArtist.stale).toEqual([0]);
      expect(state.groups.genre).toBe(stored.groups.genre);
    });

    it('marks the pages of all of them stale on a change of the library', () => {
      const stored = reducer(storeGroups(storeGroups(undefined, 'albumArtist'), 'genre'), {
        type: 'STORE_GROUP_ALBUM_PAGE',
        payload: { page: 0, items: [createAlbum('one')], total: 1 },
      });
      const state = reducer(stored, { type: 'INVALIDATE_LIBRARY' });

      expect(state.groups.albumArtist.stale).toEqual([0]);
      expect(state.groups.genre.stale).toEqual([0]);
      expect(state.groups.artist.stale).toEqual([]);
      expect(state.groupAlbums.stale).toEqual([0]);
    });
  });

  it('ignores unrelated actions', () => {
    const state = storeTracks(undefined, 0, ['/a'], 1);

    expect(reducer(state, { type: 'SET_TAB', payload: { tab: 'local' } })).toBe(state);
  });
});
