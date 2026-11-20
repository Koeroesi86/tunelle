import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import type { Track } from '@shared/types/library';
import { toSourcePath, type SourceAlbum, type SourceArtist, type SourceServer } from '@shared/schemas/sources';
import { openSource, readJson, SourceError, toResponse, wrongLoginCode } from './source-request';

const clientName = 'Tunelle';
const searchCount = '30';
const coverSize = '600';
const ticksPerSecond = 10_000_000;
const losslessContainers = ['flac', 'alac', 'wav', 'aiff', 'ape', 'wv', 'dsf', 'dff'];

const count = z.number().optional().catch(undefined);
const text = z.string().optional().catch(undefined);

const sessionSchema = z.object({ AccessToken: z.string().min(1) });

const artistSchema = z.object({ Id: z.string(), Name: z.string(), AlbumCount: count, ChildCount: count });
const albumSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  AlbumArtist: text,
  ProductionYear: count,
  ChildCount: count,
  ImageTags: z.object({ Primary: z.string().optional() }).optional().catch(undefined),
});
const songSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  Artists: z.array(z.string()).optional().catch(undefined),
  Album: text,
  IndexNumber: count,
  ParentIndexNumber: count,
  ProductionYear: count,
  Genres: z.array(z.string()).optional().catch(undefined),
  RunTimeTicks: count,
  Container: text,
  MediaSources: z
    .array(z.object({ Bitrate: count }))
    .optional()
    .catch(undefined),
});

const listOf = <Item extends z.ZodType>(item: Item) => z.object({ Items: z.array(item) });

const toArtist = ({ Id, Name, AlbumCount, ChildCount }: z.infer<typeof artistSchema>): SourceArtist => ({
  id: Id,
  name: Name,
  albumCount: AlbumCount ?? ChildCount ?? 0,
});

const toAlbum = ({ Id, Name, AlbumArtist, ProductionYear, ChildCount, ImageTags }: z.infer<typeof albumSchema>): SourceAlbum => ({
  id: Id,
  title: Name,
  artist: AlbumArtist ?? '',
  year: ProductionYear ? String(ProductionYear) : '',
  songCount: ChildCount ?? 0,
  coverArt: ImageTags?.Primary ? Id : undefined,
});

const toTrack = (serverId: string, song: z.infer<typeof songSchema>): Track => ({
  path: toSourcePath({ source: 'jellyfin', serverId, id: song.Id }),
  title: song.Name,
  artist: song.Artists?.join(', ') ?? '',
  album: song.Album ?? '',
  year: song.ProductionYear ? String(song.ProductionYear) : '',
  track: song.IndexNumber ? String(song.IndexNumber) : '',
  disk: song.ParentIndexNumber ? String(song.ParentIndexNumber) : '',
  genre: song.Genres?.join(', ') ?? '',
  picture: null,
  duration: song.RunTimeTicks ? Math.round(song.RunTimeTicks / ticksPerSecond) : null,
  codec: song.Container?.toUpperCase() ?? null,
  bitrate: song.MediaSources?.[0]?.Bitrate ?? null,
  lossless: Number(losslessContainers.includes(song.Container?.toLowerCase() ?? '')),
});

/** The calls of one Jellyfin server. The password stays here, in the main process: it is sent once to log in, and the token that comes back signs the calls. See docs/app/jellyfin.md */
export const createJellyfinClient = (server: SourceServer, password: string, userAgent: string) => {
  const host = new URL(server.url).host;
  let session: Promise<string> | undefined;

  const authorization = (token?: string) =>
    `MediaBrowser Client="${clientName}", Device="${clientName}", DeviceId="${server.id}", Version="1"${token ? `, Token="${token}"` : ''}`;

  const login = async () => {
    const response = await openSource(new URL(`${server.url}/Users/AuthenticateByName`), {
      method: 'POST',
      body: JSON.stringify({ Username: server.username, Pw: password }),
      certificate: server.certificate,
      headers: { 'User-Agent': userAgent, Authorization: authorization() },
    });
    if (response.statusCode === 401 || response.statusCode === 403) {
      response.destroy();
      throw new SourceError(wrongLoginCode, 'Wrong username or password');
    }

    const answer = sessionSchema.safeParse(await readJson(response, host));
    if (!answer.success) throw new Error(`${host} did not answer as a Jellyfin server`);

    return answer.data.AccessToken;
  };

  /** One request with the token; a token that the server no longer knows (401) is replaced by a new login, once */
  const open = async (path: string, params: Record<string, string>, signal?: AbortSignal, range?: string, retry = true): Promise<IncomingMessage> => {
    session ??= login();
    const token = await session.catch((error: unknown) => {
      session = undefined;
      throw error;
    });
    const url = new URL(`${server.url}${path}`);
    url.search = new URLSearchParams(params).toString();

    const response = await openSource(url, {
      certificate: server.certificate,
      headers: { 'User-Agent': userAgent, Authorization: authorization(token), ...(range ? { Range: range } : {}) },
      signal,
    });
    if (response.statusCode !== 401 || !retry) return response;

    response.destroy();
    session = undefined;
    return open(path, params, signal, range, false);
  };

  const call = async <Schema extends z.ZodType>(path: string, schema: Schema, params: Record<string, string> = {}) => {
    const parsed = schema.safeParse(await open(path, params).then((response) => readJson(response, host)));
    if (!parsed.success) throw new Error(`${host} sent an answer that is not understood`);

    return parsed.data;
  };

  const items = <Schema extends z.ZodType>(item: Schema, params: Record<string, string>) =>
    call('/Items', listOf(item), { recursive: 'true', sortBy: 'SortName', ...params }).then(({ Items }) => Items);

  const songsOf = (params: Record<string, string>) =>
    items(songSchema, { includeItemTypes: 'Audio', fields: 'Genres,MediaSources', ...params }).then((songs) => songs.map((song) => toTrack(server.id, song)));

  return {
    ping: () => login().then(() => undefined),
    // `/Artists` is deprecated in the API without a replacement named, so the artists are items of their own kind
    artists: () => items(artistSchema, { includeItemTypes: 'MusicArtist', fields: 'ItemCounts' }).then((artists) => artists.map(toArtist)),
    albumsOf: (artistId: string) =>
      items(albumSchema, { includeItemTypes: 'MusicAlbum', albumArtistIds: artistId, sortBy: 'ProductionYear,SortName' }).then((albums) => albums.map(toAlbum)),
    tracksOf: (albumId: string) => songsOf({ parentId: albumId, sortBy: 'ParentIndexNumber,IndexNumber' }),
    search: (query: string) =>
      Promise.all([
        items(artistSchema, { includeItemTypes: 'MusicArtist', searchTerm: query, limit: searchCount }),
        items(albumSchema, { includeItemTypes: 'MusicAlbum', searchTerm: query, limit: searchCount }),
        songsOf({ searchTerm: query, limit: searchCount }),
      ]).then(([artists, albums, tracks]) => ({ artists: artists.map(toArtist), albums: albums.map(toAlbum), tracks })),
    /** The file as it is stored (`static` asks the server not to transcode), with the range of the request so the player can seek */
    stream: async (songId: string, range: string | undefined, signal: AbortSignal) =>
      toResponse(await open(`/Audio/${encodeURIComponent(songId)}/stream`, { static: 'true' }, signal, range)),
    cover: async (coverId: string, signal: AbortSignal) =>
      toResponse(await open(`/Items/${encodeURIComponent(coverId)}/Images/Primary`, { maxWidth: coverSize }, signal)),
  };
};
