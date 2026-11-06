import type { Album, AlbumSummary, AudioFormat, GroupSummary, LibraryPage, Loudness, Track } from '@shared/types/library';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import type { AlbumQuery, AlbumSort, GroupKind, GroupQuery, GroupSort, LibraryQuery, TrackSort } from '@shared/types/library-query';
import { localUrl } from './local-url';
import { pageSize } from '../constants/library';

const getJson = async <T>(route: string): Promise<T> => {
  const response = await fetch(localUrl(route));
  if (!response.ok) throw new Error(`Failed to fetch ${route}: ${response.status}`);

  return response.json();
};

const withoutFileProtocol = (picture: string | null) => picture?.replace(/^file:\/\//, '') ?? null;

const toTrack = (track: Track): Track => ({ ...track, picture: withoutFileProtocol(track.picture) });

const toWindowQuery = (page: number) => `offset=${page * pageSize}&limit=${pageSize}`;

/** The sort, the folders and the search as the parameters of a request, the folders once each */
const toQuery = ({ sort, folders, search }: LibraryQuery<TrackSort | AlbumSort | GroupSort>, extra: string[] = []) =>
  [
    ...(sort ? [`sort=${sort.field}`, `dir=${sort.direction}`] : []),
    ...folders.map((folder) => `folder=${encodeURIComponent(folder)}`),
    ...(search ? [`search=${encodeURIComponent(search)}`] : []),
    ...extra,
  ].join('&');

const withQuery = (route: string, query: LibraryQuery<TrackSort | AlbumSort | GroupSort>, extra: string[] = []) =>
  [route, toQuery(query, extra)].filter(Boolean).join(route.includes('?') ? '&' : '?');

export const fetchTrackPage = (page: number, query: LibraryQuery<TrackSort>) =>
  getJson<LibraryPage<Track>>(withQuery(`/library/tracks?${toWindowQuery(page)}`, query)).then(({ items, total }) => ({
    items: items.map(toTrack),
    total,
  }));

const toAlbumSummary = (album: AlbumSummary): AlbumSummary => ({ ...album, cover: withoutFileProtocol(album.cover) });

/** The albums of the query, the ones of a group when it has one */
export const fetchAlbumPage = (page: number, query: AlbumQuery) =>
  getJson<LibraryPage<AlbumSummary>>(
    withQuery(`/library/albums?${toWindowQuery(page)}`, query, query.group ? [`by=${query.group.kind}`, `group=${encodeURIComponent(query.group.key)}`] : [])
  ).then(({ items, total }) => ({ items: items.map(toAlbumSummary), total }));

/** The artists, the album artists or the genres of the query */
export const fetchGroupPage = (kind: GroupKind, page: number, query: GroupQuery) =>
  getJson<LibraryPage<GroupSummary>>(
    withQuery(`/library/groups?${toWindowQuery(page)}&by=${kind}`, query, query.filter ? [`q=${encodeURIComponent(query.filter)}`] : [])
  ).then(({ items, total }) => ({ items: items.map((group) => ({ ...group, cover: withoutFileProtocol(group.cover) })), total }));

/** The tracks of the query at once, for what needs every track */
export const fetchLibrary = (query: LibraryQuery<TrackSort>) => getJson<Track[]>(withQuery('/library', query)).then((library) => library.map(toTrack));

/** The album of a summary with its tracks */
export const fetchAlbum = ({ trackCount: _trackCount, ...album }: AlbumSummary): Promise<Album> =>
  getJson<Track[]>(`/library/album?path=${encodeURIComponent(album.path)}&title=${encodeURIComponent(album.title)}`).then((tracks) => ({
    ...album,
    tracks: tracks.map(toTrack),
  }));

/** The format and the loudness of a track as the player takes them, undefined for a track the library does not have or when the answer fails: a track plays as it is then */
export const fetchTrackFormat = (path: string) => getJson<AudioFormat & Loudness>(`/library/track?path=${encodeURIComponent(path)}`).catch(() => undefined);

/** The analysis of the loudness of a track, undefined for a track that was not measured or when the answer fails: the view shows nothing then */
export const fetchLoudnessAnalysis = (path: string) => getJson<LoudnessAnalysis>(`/library/loudness?path=${encodeURIComponent(path)}`).catch(() => undefined);
