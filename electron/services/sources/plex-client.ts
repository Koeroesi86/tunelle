import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import type { Track } from '@shared/types/library';
import { toSourcePath, type SourceAlbum, type SourceArtist, type SourceServer } from '@shared/schemas/sources';
import { openSource, readJson, SourceError, toResponse, wrongLoginCode } from './source-request';

const productName = 'Tunelle';
const searchCount = '30';
const coverSize = '600';
const musicType = 'artist';
const losslessCodecs = ['flac', 'alac', 'wav', 'aiff', 'ape', 'wv', 'dsd', 'dsf', 'dff'];
// the numbers of `type` in the library calls of the Plex API: 8 artist, 9 album
const artistType = '8';
const libraryTypes = { artists: artistType, albums: '9', tracks: '10' };
// the order of a list as the Plex API names it
const libraryOrders = { title: 'titleSort', recent: 'addedAt:desc' };

const count = z.number().optional().catch(undefined);
const text = z.string().optional().catch(undefined);

const itemSchema = z.object({
  ratingKey: z.string(),
  title: z.string(),
  parentTitle: text,
  grandparentTitle: text,
  year: count,
  index: count,
  parentIndex: count,
  duration: count,
  childCount: count,
  leafCount: count,
  thumb: text,
  parentThumb: text,
  grandparentThumb: text,
  Genre: z
    .array(z.object({ tag: z.string() }))
    .optional()
    .catch(undefined),
  Media: z
    .array(z.object({ audioCodec: text, container: text, bitrate: count, Part: z.array(z.object({ key: z.string() })).optional() }))
    .optional()
    .catch(undefined),
});
type Item = z.infer<typeof itemSchema>;

const containerOf = <Schema extends z.ZodType>(entries: Schema) => z.object({ MediaContainer: entries });
const metadataSchema = containerOf(z.object({ totalSize: count, Metadata: z.array(itemSchema).optional().catch(undefined) }));
const sectionsSchema = containerOf(
  z.object({
    Directory: z
      .array(z.object({ key: z.string(), type: z.string() }))
      .optional()
      .catch(undefined),
  })
);
const hubsSchema = containerOf(
  z.object({ Hub: z.array(z.object({ type: z.string(), Metadata: z.array(itemSchema).optional().catch(undefined) })).optional() })
);

const toArtist = ({ ratingKey, title, childCount, thumb }: Item): SourceArtist => ({
  id: ratingKey,
  name: title,
  albumCount: childCount,
  coverArt: thumb ? ratingKey : undefined,
});

const toAlbum = ({ ratingKey, title, parentTitle, year, leafCount, thumb }: Item): SourceAlbum => ({
  id: ratingKey,
  title,
  artist: parentTitle ?? '',
  year: year ? String(year) : '',
  songCount: leafCount,
  coverArt: thumb ? ratingKey : undefined,
});

const toTrack = (serverId: string, item: Item): Track => {
  const media = item.Media?.[0];

  return {
    path: toSourcePath({ source: 'plex', serverId, id: item.ratingKey }),
    title: item.title,
    artist: item.grandparentTitle ?? '',
    album: item.parentTitle ?? '',
    year: item.year ? String(item.year) : '',
    track: item.index ? String(item.index) : '',
    disk: item.parentIndex ? String(item.parentIndex) : '',
    genre: item.Genre?.map(({ tag }) => tag).join(', ') ?? '',
    picture: null,
    duration: item.duration ? Math.round(item.duration / 1000) : null,
    codec: (media?.audioCodec ?? media?.container)?.toUpperCase() ?? null,
    bitrate: media?.bitrate ?? null,
    lossless: Number(losslessCodecs.includes(media?.audioCodec?.toLowerCase() ?? '')),
  };
};

export type PlexClient = ReturnType<typeof createPlexClient>;

/** The calls of one Plex Media Server. The token is the secret of the server entry and signs each call in a header, never in an address. See docs/app/plex.md */
export const createPlexClient = (server: SourceServer, token: string, userAgent: string) => {
  const host = new URL(server.url).host;
  const files = new Map<string, string>();

  const open = async (path: string, params: Record<string, string> = {}, signal?: AbortSignal, range?: string): Promise<IncomingMessage> => {
    const url = new URL(`${server.url}${path}`);
    url.search = new URLSearchParams(params).toString();

    const response = await openSource(url, {
      certificate: server.certificate,
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': server.id,
        'X-Plex-Product': productName,
        ...(range ? { Range: range } : {}),
      },
      signal,
    });
    if (response.statusCode !== 401) return response;

    response.destroy();
    throw new SourceError(wrongLoginCode, 'The token is not accepted');
  };

  const call = async <Schema extends z.ZodType>(path: string, schema: Schema, params?: Record<string, string>) => {
    const parsed = schema.safeParse(await open(path, params).then((response) => readJson(response, host)));
    if (!parsed.success) throw new Error(`${host} did not answer as a Plex server`);

    return parsed.data;
  };

  const metadata = (path: string, params?: Record<string, string>) =>
    call(path, metadataSchema, params).then(({ MediaContainer }) => MediaContainer.Metadata ?? []);

  const musicSections = () =>
    call('/library/sections', sectionsSchema).then(({ MediaContainer }) => (MediaContainer.Directory ?? []).filter(({ type }) => type === musicType));

  /** The file of a song is a part of its first media: its path is read from the song once */
  const fileOf = async (songId: string) => {
    const known = files.get(songId);
    if (known) return known;

    const key = (await metadata(`/library/metadata/${encodeURIComponent(songId)}`)).at(0)?.Media?.at(0)?.Part?.at(0)?.key;
    if (!key) throw new Error(`${host} has no file for the song`);
    files.set(songId, key);

    return key;
  };

  return {
    ping: () => call('/library/sections', sectionsSchema).then(() => undefined),
    artists: () =>
      musicSections()
        .then((sections) => Promise.all(sections.map(({ key }) => metadata(`/library/sections/${key}/all`, { type: artistType }))))
        .then((lists) => lists.flat().map(toArtist)),
    /** A page of the albums, the artists or the songs of the first music library, which the server sorts and counts */
    library: async (kind: keyof typeof libraryTypes, sort: keyof typeof libraryOrders, start: number, size: number) => {
      const section = (await musicSections()).at(0);
      if (!section) return { total: 0, items: [] };

      const { MediaContainer } = await call(`/library/sections/${section.key}/all`, metadataSchema, {
        type: libraryTypes[kind],
        sort: libraryOrders[sort],
        'X-Plex-Container-Start': String(start),
        'X-Plex-Container-Size': String(size),
      });
      const entries = MediaContainer.Metadata ?? [];
      const total = MediaContainer.totalSize ?? entries.length;
      if (kind === 'artists') return { total, items: entries.map(toArtist) };

      return kind === 'albums' ? { total, items: entries.map(toAlbum) } : { total, items: entries.map((song) => toTrack(server.id, song)) };
    },
    albumsOf: (artistId: string) => metadata(`/library/metadata/${encodeURIComponent(artistId)}/children`).then((albums) => albums.map(toAlbum)),
    tracksOf: (albumId: string) =>
      metadata(`/library/metadata/${encodeURIComponent(albumId)}/children`).then((songs) => songs.map((song) => toTrack(server.id, song))),
    search: (query: string) =>
      call('/hubs/search', hubsSchema, { query, limit: searchCount }).then(({ MediaContainer }) => {
        const found = (type: string) => (MediaContainer.Hub ?? []).filter((hub) => hub.type === type).flatMap((hub) => hub.Metadata ?? []);

        return {
          artists: found('artist').map(toArtist),
          albums: found('album').map(toAlbum),
          tracks: found('track').map((song) => toTrack(server.id, song)),
        };
      }),
    /** The file as it is stored, with the range of the request so the player can seek */
    stream: async (songId: string, range: string | undefined, signal: AbortSignal) => toResponse(await open(await fileOf(songId), {}, signal, range)),
    /** The picture of the item, and for a song without one of its own that of its album */
    cover: async (coverId: string, signal: AbortSignal) => {
      const size = { width: coverSize, height: coverSize };
      const own = await open(`/library/metadata/${encodeURIComponent(coverId)}/thumb`, size, signal);
      if (own.statusCode !== 404) return toResponse(own);

      own.destroy();
      const song = (await metadata(`/library/metadata/${encodeURIComponent(coverId)}`)).at(0);
      const picture = song?.parentThumb ?? song?.grandparentThumb;
      if (!picture) throw new SourceError(404, 'The item has no picture');

      return toResponse(await open(picture, size, signal));
    },
  };
};
