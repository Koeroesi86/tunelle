import type { Reducer } from 'redux';
import type { AlbumSummary, GroupSummary, Track } from '@shared/types/library';
import { groupKinds } from '@shared/types/library-query';
import type { GroupKind } from '@shared/types/library-query';
import { isAppAction } from '../types';
import { createPageCache, markStale, storePage } from './pages';
import type { PageCache } from './pages';

export interface LibraryState {
  tracks: PageCache<Track>;
  albums: PageCache<AlbumSummary>;
  /** The artists, the album artists and the genres, the albums of the one that is open */
  groups: Record<GroupKind, PageCache<GroupSummary>>;
  groupAlbums: PageCache<AlbumSummary>;
  /** The first page has arrived */
  loaded: boolean;
}

const initialState: LibraryState = {
  tracks: createPageCache(),
  albums: createPageCache(),
  groups: { artist: createPageCache(), albumArtist: createPageCache(), genre: createPageCache() },
  groupAlbums: createPageCache(),
  loaded: false,
};

const isGroupKind = (kind: string): kind is GroupKind => groupKinds.some((groupKind) => groupKind === kind);

const reducer: Reducer<LibraryState> = (state = initialState, action) => {
  if (!isAppAction(action)) return state;

  switch (action.type) {
    case 'STORE_TRACK_PAGE': {
      const { page, items, total } = action.payload;
      return { ...state, tracks: storePage(state.tracks, page, items, total), loaded: true };
    }
    case 'STORE_ALBUM_PAGE': {
      const { page, items, total } = action.payload;
      return { ...state, albums: storePage(state.albums, page, items, total) };
    }
    case 'STORE_GROUP_PAGE': {
      const { kind, page, items, total } = action.payload;
      return { ...state, groups: { ...state.groups, [kind]: storePage(state.groups[kind], page, items, total) } };
    }
    case 'STORE_GROUP_ALBUM_PAGE': {
      const { page, items, total } = action.payload;
      return { ...state, groupAlbums: storePage(state.groupAlbums, page, items, total) };
    }
    // the sort, the filter or the folders changed: the pages are of another list, the first one is fetched again
    case 'RESET_LIBRARY': {
      const { kind } = action.payload;
      return isGroupKind(kind) ? { ...state, groups: { ...state.groups, [kind]: createPageCache() } } : { ...state, [kind]: createPageCache() };
    }
    // the covers of the artists and the album artists changed: the pages are fetched again when they are shown
    case 'ARTIST_PHOTOS_READY':
      return { ...state, groups: { ...state.groups, artist: markStale(state.groups.artist), albumArtist: markStale(state.groups.albumArtist) } };
    // the cover of an album changed: the lists that show it fetch their pages again when they are shown
    case 'ALBUM_COVER_CHANGED':
      return {
        ...state,
        albums: markStale(state.albums),
        groups: { artist: markStale(state.groups.artist), albumArtist: markStale(state.groups.albumArtist), genre: markStale(state.groups.genre) },
        groupAlbums: markStale(state.groupAlbums),
      };
    case 'INVALIDATE_LIBRARY':
      return {
        ...state,
        tracks: markStale(state.tracks),
        albums: markStale(state.albums),
        groups: { artist: markStale(state.groups.artist), albumArtist: markStale(state.groups.albumArtist), genre: markStale(state.groups.genre) },
        groupAlbums: markStale(state.groupAlbums),
      };
    default:
      return state;
  }
};

export default reducer;
