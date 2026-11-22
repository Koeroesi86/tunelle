import type { AlbumSummary, GroupSummary, Track } from '@shared/types/library';
import type { LibraryKind, SourceAlbum, SourceArtist, SourceBrowse, SourceBrowseResult, SourceSearchResult, SourceServerInfo } from '@shared/schemas/sources';
import { pageSize } from '../../constants/library';
import { pageRequest, toAlbumSummary, toGroupSummary } from '../../domain/source-library';
import { createPageCache, markStale, storePage } from '../../domain/page-cache';
import type { PageCache } from '../../domain/page-cache';

/** What the servers answered as the lists the library views show, by the request of the list */
export interface SourceLists {
  albums: Record<string, PageCache<AlbumSummary>>;
  artists: Record<string, PageCache<GroupSummary>>;
  tracks: Record<string, PageCache<Track>>;
}

export const noSourceLists: SourceLists = { albums: {}, artists: {}, tracks: {} };

/** The key of a list: the pages of a library list are one list, so it is the request of its first page */
export const listKey = (request: SourceBrowse) => JSON.stringify(pageRequest(request, 0));

const isObject = (result: unknown): result is object => typeof result === 'object' && result !== null && !Array.isArray(result);
const isSearch = (result: unknown): result is SourceSearchResult => isObject(result) && 'artists' in result;
const itemsOf = (result: SourceBrowseResult | undefined): unknown[] => {
  if (Array.isArray(result)) return result;
  return isObject(result) && 'items' in result ? result.items : [];
};

const isAlbum = (item: unknown): item is SourceAlbum => isObject(item) && 'id' in item && 'title' in item;
const isArtist = (item: unknown): item is SourceArtist => isObject(item) && 'name' in item && !('path' in item);
const isTrack = (item: unknown): item is Track => isObject(item) && 'path' in item;

/** A server that tells no total has more while the page is full: the list is one item longer than what is fetched, which asks for the next page */
const totalOf = (request: SourceBrowse, result: SourceBrowseResult | undefined, count: number) => {
  const start = request.what === 'library' ? request.start : 0;
  if (isObject(result) && 'total' in result && typeof result.total === 'number') return result.total;
  return start + count + (request.what === 'library' && count >= pageSize ? 1 : 0);
};

const storeList = <T>(lists: Record<string, PageCache<T>>, key: string, request: SourceBrowse, items: T[], total: number) => {
  const first = request.what === 'library' ? request.start / pageSize : 0;
  // a list that is not in pages is one answer, cut into the pages of the views
  const pages =
    request.what === 'library'
      ? [items]
      : Array.from({ length: Math.ceil(items.length / pageSize) }, (_, page) => items.slice(page * pageSize, (page + 1) * pageSize));

  return {
    ...lists,
    [key]: (pages.length ? pages : [[]]).reduce((cache, page, offset) => storePage(cache, first + offset, page, total), lists[key] ?? createPageCache<T>()),
  };
};

/** The kinds of list a request fills: a search fills all, and the others the one of their answer */
const kindsOf = (request: SourceBrowse): LibraryKind[] => {
  if (request.what === 'library') return [request.kind];
  if (request.what === 'search') return ['albums', 'artists', 'tracks'];
  return [request.what];
};

/** The answer of a request put into the lists of its kind */
export const storeAnswer = (lists: SourceLists, servers: SourceServerInfo[], request: SourceBrowse, result: SourceBrowseResult | undefined): SourceLists => {
  const kind = servers.find(({ id }) => id === request.serverId)?.kind;
  if (!kind || !result) return lists;

  const key = listKey(request);
  const kinds = kindsOf(request);
  const found = isSearch(result) ? result : undefined;
  const items = found ? [] : itemsOf(result);
  const artists = (found?.artists ?? items.filter(isArtist)).map((artist) => toGroupSummary(kind, request.serverId, artist));
  const albums = (found?.albums ?? items.filter(isAlbum)).map((album) => toAlbumSummary(kind, request.serverId, album));
  const tracks = found?.tracks ?? items.filter(isTrack);
  const total = (count: number) => (found ? count : totalOf(request, result, items.length));

  return {
    albums: kinds.includes('albums') ? storeList(lists.albums, key, request, albums, total(albums.length)) : lists.albums,
    artists: kinds.includes('artists') ? storeList(lists.artists, key, request, artists, total(artists.length)) : lists.artists,
    tracks: kinds.includes('tracks') ? storeList(lists.tracks, key, request, tracks, total(tracks.length)) : lists.tracks,
  };
};

const staleAll = <T>(lists: Record<string, PageCache<T>>) => Object.fromEntries(Object.entries(lists).map(([key, cache]) => [key, markStale(cache)]));

/** Every list is out of date, its pages are fetched again when a view needs them */
export const markListsStale = (lists: SourceLists): SourceLists => ({
  albums: staleAll(lists.albums),
  artists: staleAll(lists.artists),
  tracks: staleAll(lists.tracks),
});
