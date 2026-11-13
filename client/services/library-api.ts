import { prettifyError, z, type ZodType } from 'zod';
import type { Album, AlbumSummary, Track } from '@shared/types/library';
import { albumSummarySchema, groupSummarySchema, trackFormatSchema, trackSchema } from '@shared/schemas/library';
import { loudnessAnalysisSchema } from '@shared/schemas/loudness';
import type { AlbumQuery, AlbumSort, GroupKind, GroupQuery, GroupSort, LibraryQuery, TrackSort } from '@shared/types/library-query';
import { localUrl } from './local-url';
import { pageSize } from '../constants/library';

const getJson = async <S extends ZodType>(route: string, schema: S): Promise<z.output<S>> => {
  const response = await fetch(localUrl(route));
  if (!response.ok) throw new Error(`Failed to fetch ${route}: ${response.status}`);

  const result = schema.safeParse(await response.json());
  if (!result.success) throw new Error(`The answer of ${route} does not match:\n${prettifyError(result.error)}`);

  return result.data;
};

const pageOf = <S extends ZodType>(item: S) => z.object({ items: z.array(item), total: z.number() });

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
  getJson(withQuery(`/library/tracks?${toWindowQuery(page)}`, query), pageOf(trackSchema)).then(({ items, total }) => ({
    items: items.map(toTrack),
    total,
  }));

const toAlbumSummary = (album: AlbumSummary): AlbumSummary => ({ ...album, cover: withoutFileProtocol(album.cover) });

/** The albums of the query, the ones of a group when it has one */
export const fetchAlbumPage = (page: number, query: AlbumQuery) =>
  getJson(
    withQuery(`/library/albums?${toWindowQuery(page)}`, query, query.group ? [`by=${query.group.kind}`, `group=${encodeURIComponent(query.group.key)}`] : []),
    pageOf(albumSummarySchema)
  ).then(({ items, total }) => ({ items: items.map(toAlbumSummary), total }));

/** The artists, the album artists or the genres of the query */
export const fetchGroupPage = (kind: GroupKind, page: number, query: GroupQuery) =>
  getJson(
    withQuery(`/library/groups?${toWindowQuery(page)}&by=${kind}`, query, query.filter ? [`q=${encodeURIComponent(query.filter)}`] : []),
    pageOf(groupSummarySchema)
  ).then(({ items, total }) => ({ items: items.map((group) => ({ ...group, cover: withoutFileProtocol(group.cover) })), total }));

/** The photo or cover the tile of an artist, an album artist or a genre shows, null when it has none */
export const fetchGroupCover = (kind: GroupKind, key: string) =>
  getJson(`/library/group-cover?by=${kind}&key=${encodeURIComponent(key)}`, z.object({ cover: z.string().nullable() })).then(({ cover }) =>
    withoutFileProtocol(cover)
  );

/** The tracks of the query at once, for what needs every track */
export const fetchLibrary = (query: LibraryQuery<TrackSort>) =>
  getJson(withQuery('/library', query), z.array(trackSchema)).then((library) => library.map(toTrack));

/** The album of a summary with its tracks */
export const fetchAlbum = ({ trackCount: _trackCount, ...album }: AlbumSummary): Promise<Album> =>
  getJson(`/library/album?path=${encodeURIComponent(album.path)}&title=${encodeURIComponent(album.title)}`, z.array(trackSchema)).then((tracks) => ({
    ...album,
    tracks: tracks.map(toTrack),
  }));

/** The format and the loudness of a track as the player takes them, undefined for a track the library does not have or when the answer fails: a track plays as it is then */
export const fetchTrackFormat = (path: string) => getJson(`/library/track?path=${encodeURIComponent(path)}`, trackFormatSchema).catch(() => undefined);

/** The analysis of the loudness of a track, undefined for a track that was not measured or when the answer fails: the view shows nothing then */
export const fetchLoudnessAnalysis = (path: string) =>
  getJson(`/library/loudness?path=${encodeURIComponent(path)}`, loudnessAnalysisSchema).catch(() => undefined);
