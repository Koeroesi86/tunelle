import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Track } from '@shared/types/library';
import {
  toSourcePath,
  type LibraryKind,
  type LibrarySort,
  type SourceAlbum,
  type SourceArtist,
  type SourcePage,
  type SourceServer,
} from '@shared/schemas/sources';
import { openSource, readJson, SourceError, toResponse } from './source-request';
import { toCodecName } from '../../utils/codec-name';

const apiVersion = '1.16.1';
const clientName = 'tunelle';
const searchCount = '30';
const coverSize = '600';
const losslessSuffixes = ['flac', 'alac', 'wav', 'aiff', 'ape', 'wv', 'dsf', 'dff'];

/** The server answered, and what it answered is an error (Subsonic does that with the status 200). The codes are in the API: 40 is a wrong user or password */
export class SubsonicError extends SourceError {}

// some servers write an id as a number
const id = z.union([z.string(), z.number()]).transform(String);
const text = z.string().optional().catch(undefined);
const count = z.number().optional().catch(undefined);

const envelopeSchema = z.object({
  'subsonic-response': z.looseObject({ status: z.string(), error: z.object({ code: z.number(), message: z.string().optional() }).optional() }),
});

const artistSchema = z.object({ id, name: z.string(), albumCount: count });
const albumSchema = z.object({ id, name: z.string(), artist: text, year: count, songCount: count, coverArt: id.optional().catch(undefined) });
const songSchema = z.object({
  id,
  title: z.string(),
  artist: text,
  album: text,
  track: count,
  discNumber: count,
  year: count,
  genre: text,
  duration: count,
  bitRate: count,
  suffix: text,
});

const libraryOrders = { title: 'alphabeticalByName', recent: 'newest' };

const pingSchema = z.object({});
const albumListSchema = z.object({ albumList2: z.object({ album: z.array(albumSchema).optional() }) });
const artistsSchema = z.object({ artists: z.object({ index: z.array(z.object({ artist: z.array(artistSchema).optional() })).optional() }) });
const artistAlbumsSchema = z.object({ artist: z.object({ album: z.array(albumSchema).optional() }) });
const albumSongsSchema = z.object({ album: z.object({ song: z.array(songSchema).optional() }) });
const searchSchema = z.object({
  searchResult3: z.object({ artist: z.array(artistSchema).optional(), album: z.array(albumSchema).optional(), song: z.array(songSchema).optional() }),
});

type Song = z.infer<typeof songSchema>;

const toArtist = ({ id, name, albumCount }: z.infer<typeof artistSchema>): SourceArtist => ({ id, name, albumCount: albumCount ?? 0 });

const toAlbum = ({ id, name, artist, year, songCount, coverArt }: z.infer<typeof albumSchema>): SourceAlbum => ({
  id,
  title: name,
  artist: artist ?? '',
  year: year ? String(year) : '',
  songCount: songCount ?? 0,
  coverArt,
});

const toTrack = (serverId: string, song: Song): Track => ({
  path: toSourcePath({ source: 'subsonic', serverId, id: song.id }),
  title: song.title,
  artist: song.artist ?? '',
  album: song.album ?? '',
  year: song.year ? String(song.year) : '',
  track: song.track ? String(song.track) : '',
  disk: song.discNumber ? String(song.discNumber) : '',
  genre: song.genre ?? '',
  picture: null,
  duration: song.duration ?? null,
  codec: toCodecName(song.suffix),
  bitrate: song.bitRate ? song.bitRate * 1000 : null,
  lossless: Number(losslessSuffixes.includes(song.suffix?.toLowerCase() ?? '')),
});

/** The answer of a server as the schema of the call: a body that is no answer of a Subsonic server, an error of the server and a shape that is not the one of the call fail */
const understand = <Schema extends z.ZodType>(body: unknown, schema: Schema, host: string): z.output<Schema> => {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) throw new Error(`${host} did not answer as a Subsonic server`);

  const { status, error, ...answer } = envelope.data['subsonic-response'];
  if (status !== 'ok') throw new SubsonicError(error?.code ?? 0, error?.message ?? `${host} answered with the status ${status}`);

  const parsed = schema.safeParse(answer);
  if (!parsed.success) throw new Error(`${host} sent an answer that is not understood`);

  return parsed.data;
};

/** A server that answers with a document and not with audio or a picture (Subsonic does that with the status 200) has no such file */
const isDocument = (response: Response) => /json|xml|html/.test(response.headers.get('content-type') ?? '');

/** The calls of one server. The password stays here, in the main process, and signs each call with a new salt. See docs/app/sources.md */
export const createSubsonicClient = (server: SourceServer, password: string, userAgent: string) => {
  const host = new URL(server.url).host;

  const open = (name: string, params: Record<string, string>, signal?: AbortSignal, range?: string) => {
    const salt = randomBytes(8).toString('hex');
    // the protocol asks for md5 of the password and the salt, so the password itself is not sent
    const token = createHash('md5').update(`${password}${salt}`).digest('hex');
    const url = new URL(`${server.url}/rest/${name}.view`);
    url.search = new URLSearchParams({ u: server.username, t: token, s: salt, v: apiVersion, c: clientName, f: 'json', ...params }).toString();

    return openSource(url, { certificate: server.certificate, headers: { 'User-Agent': userAgent, ...(range ? { Range: range } : {}) }, signal });
  };

  const call = async <Schema extends z.ZodType>(name: string, schema: Schema, params: Record<string, string> = {}) =>
    understand(await open(name, params).then((response) => readJson(response, host)), schema, host);

  const media = async (name: string, params: Record<string, string>, signal: AbortSignal, range?: string) => {
    const response = toResponse(await open(name, params, signal, range));
    if (!isDocument(response)) return response;

    await response.body?.cancel();
    return new Response(undefined, { status: 404 });
  };

  const artists = () => call('getArtists', artistsSchema).then(({ artists: found }) => (found.index ?? []).flatMap(({ artist }) => artist ?? []).map(toArtist));

  /** A page of the albums or the artists. The server counts neither the albums (no total) nor pages the artists, which are all cut here; it has no list of all songs */
  const library = async (kind: LibraryKind, sort: LibrarySort, start: number, size: number): Promise<SourcePage> => {
    if (kind === 'tracks') throw new Error('This server has no list of its songs');
    if (kind === 'artists') {
      const all = await artists();
      return { total: all.length, items: all.slice(start, start + size) };
    }

    const { albumList2 } = await call('getAlbumList2', albumListSchema, { type: libraryOrders[sort], offset: String(start), size: String(size) });
    return { items: (albumList2.album ?? []).map(toAlbum) };
  };

  return {
    ping: () => call('ping', pingSchema).then(() => undefined),
    artists,
    library,
    albumsOf: (artistId: string) => call('getArtist', artistAlbumsSchema, { id: artistId }).then(({ artist }) => (artist.album ?? []).map(toAlbum)),
    tracksOf: (albumId: string) =>
      call('getAlbum', albumSongsSchema, { id: albumId }).then(({ album }) => (album.song ?? []).map((song) => toTrack(server.id, song))),
    search: (query: string) =>
      call('search3', searchSchema, { query, artistCount: searchCount, albumCount: searchCount, songCount: searchCount }).then(({ searchResult3 }) => ({
        artists: (searchResult3.artist ?? []).map(toArtist),
        albums: (searchResult3.album ?? []).map(toAlbum),
        tracks: (searchResult3.song ?? []).map((song) => toTrack(server.id, song)),
      })),
    /** The file as it is stored (`format=raw` asks the server not to transcode), with the range of the request so the player can seek */
    stream: (songId: string, range: string | undefined, signal: AbortSignal) => media('stream', { id: songId, format: 'raw' }, signal, range),
    cover: (coverId: string, signal: AbortSignal) => media('getCoverArt', { id: coverId, size: coverSize }, signal),
  };
};
