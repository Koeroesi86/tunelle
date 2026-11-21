import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openSource, SourceError } from './source-request';
import { createPlexClient } from './plex-client';

vi.mock('./source-request', async (importOriginal) => ({ ...(await importOriginal<typeof import('./source-request')>()), openSource: vi.fn() }));

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const server = { id: serverId, kind: 'plex', name: 'Den', url: 'https://plex.example.com:32400', username: 'plex' } as const;
const userAgent = 'Tunelle/1.0';

const answer = (body: string, statusCode = 200, headers: IncomingMessage['headers'] = { 'content-type': 'application/json' }) =>
  Object.assign(Readable.from([Buffer.from(body)]), { statusCode, headers }) as unknown as IncomingMessage;
const container = (entries: object, statusCode = 200) => answer(JSON.stringify({ MediaContainer: entries }), statusCode);
const reply = (...responses: IncomingMessage[]) => responses.forEach((response) => vi.mocked(openSource).mockResolvedValueOnce(response));
const sentUrl = (call: number) => vi.mocked(openSource).mock.calls[call][0];
const sentOptions = (call: number) => vi.mocked(openSource).mock.calls[call][1];

const client = () => createPlexClient(server, 'secret-token', userAgent);
const song = {
  ratingKey: '77',
  title: 'Song',
  parentTitle: 'Album',
  grandparentTitle: 'Artist',
  year: 2001,
  index: 3,
  parentIndex: 1,
  duration: 185000,
  Genre: [{ tag: 'Rock' }, { tag: 'Pop' }],
  Media: [{ audioCodec: 'flac', container: 'flac', bitrate: 900, Part: [{ key: '/library/parts/9/1/file.flac' }] }],
};

describe('the Plex client', () => {
  beforeEach(() => vi.mocked(openSource).mockReset());

  it('signs every call with the token in a header and asks for JSON, never in the address', async () => {
    reply(container({ Directory: [] }));

    await client().ping();

    expect(sentUrl(0).href).toBe('https://plex.example.com:32400/library/sections');
    expect(sentUrl(0).href).not.toContain('secret-token');
    expect(sentOptions(0)?.headers).toMatchObject({
      'X-Plex-Token': 'secret-token',
      'X-Plex-Client-Identifier': serverId,
      Accept: 'application/json',
      'User-Agent': userAgent,
    });
  });

  it('is a wrong login for a token that the server does not accept', async () => {
    reply(answer('', 401));

    const failure = await client()
      .ping()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SourceError);
    expect(failure).toMatchObject({ code: 40 });
  });

  it('is an error for an answer that is not a Plex one', async () => {
    reply(answer(JSON.stringify({ other: true })));

    await expect(client().ping()).rejects.toThrow('plex.example.com:32400 did not answer as a Plex server');
  });

  it('lists the artists of every music section and no other section', async () => {
    reply(
      container({
        Directory: [
          { key: '1', type: 'artist' },
          { key: '2', type: 'movie' },
          { key: '3', type: 'artist' },
        ],
      }),
      container({ Metadata: [{ ratingKey: '10', title: 'A', childCount: 2 }] }),
      container({ Metadata: [{ ratingKey: '11', title: 'B' }] })
    );

    expect(await client().artists()).toEqual([
      { id: '10', name: 'A', albumCount: 2 },
      { id: '11', name: 'B', albumCount: undefined },
    ]);
    expect(sentUrl(1).pathname).toBe('/library/sections/1/all');
    expect(sentUrl(1).search).toBe('?type=8');
    expect(sentUrl(2).pathname).toBe('/library/sections/3/all');
  });

  it('lists the albums of an artist, with a cover only when there is a picture', async () => {
    reply(
      container({
        Metadata: [
          { ratingKey: '20', title: 'First', parentTitle: 'A', year: 1999, leafCount: 12, thumb: '/library/metadata/20/thumb/1' },
          { ratingKey: '21', title: 'Second' },
        ],
      })
    );

    const albums = await client().albumsOf('10');

    expect(sentUrl(0).pathname).toBe('/library/metadata/10/children');
    expect(albums).toEqual([
      { id: '20', title: 'First', artist: 'A', year: '1999', songCount: 12, coverArt: '20' },
      { id: '21', title: 'Second', artist: '', year: '', songCount: undefined, coverArt: undefined },
    ]);
  });

  it('turns a song into a track whose path names the server', async () => {
    reply(container({ Metadata: [song] }));

    expect(await client().tracksOf('20')).toEqual([
      {
        path: `plex:${serverId}:77`,
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        year: '2001',
        track: '3',
        disk: '1',
        genre: 'Rock, Pop',
        picture: null,
        duration: 185,
        codec: 'FLAC',
        bitrate: 900,
        lossless: 1,
      },
    ]);
  });

  it('is not lossless for a codec that is lossy', async () => {
    reply(container({ Metadata: [{ ...song, Media: [{ audioCodec: 'mp3' }] }] }));

    expect((await client().tracksOf('20'))[0]).toMatchObject({ codec: 'MP3', lossless: 0 });
  });

  it('groups the hubs of a search by their kind', async () => {
    reply(
      container({
        Hub: [
          { type: 'artist', Metadata: [{ ratingKey: '10', title: 'A' }] },
          { type: 'album', Metadata: [{ ratingKey: '20', title: 'L' }] },
          { type: 'track', Metadata: [song] },
          { type: 'show' },
        ],
      })
    );

    const found = await client().search('so');

    expect(sentUrl(0).search).toBe('?query=so&limit=30');
    expect(found.artists).toHaveLength(1);
    expect(found.albums).toHaveLength(1);
    expect(found.tracks[0].title).toBe('Song');
  });

  it('streams the file of the song with the range, and reads its path only once', async () => {
    const file = () => answer('audio', 206, { 'content-type': 'audio/flac', 'content-range': 'bytes 0-4/5' });
    reply(container({ Metadata: [song] }), file(), file());
    const plex = client();
    const signal = new AbortController().signal;

    const response = await plex.stream('77', 'bytes=0-4', signal);
    await plex.stream('77', undefined, signal);

    expect(vi.mocked(openSource)).toHaveBeenCalledTimes(3);
    expect(sentUrl(0).pathname).toBe('/library/metadata/77');
    expect(sentUrl(1).pathname).toBe('/library/parts/9/1/file.flac');
    expect(sentOptions(1)?.headers).toMatchObject({ Range: 'bytes=0-4' });
    expect(sentOptions(2)?.headers).not.toHaveProperty('Range');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-4/5');
  });

  it('fails to stream a song that has no file', async () => {
    reply(container({ Metadata: [{ ratingKey: '78', title: 'Empty' }] }));

    await expect(client().stream('78', undefined, new AbortController().signal)).rejects.toThrow('has no file');
  });

  it('asks for the cover as the picture of the item at a size', async () => {
    reply(answer('img', 200, { 'content-type': 'image/jpeg' }));

    await client().cover('20', new AbortController().signal);

    expect(sentUrl(0).pathname).toBe('/library/metadata/20/thumb');
    expect(sentUrl(0).search).toBe('?width=600&height=600');
  });

  it('lists a page of the albums of the first music library with the order and the total of the server', async () => {
    reply(
      container({ Directory: [{ key: '3', type: 'artist' }] }),
      container({ totalSize: 120, Metadata: [{ ratingKey: '20', title: 'First', parentTitle: 'A', year: 1999, thumb: '/t' }] })
    );

    const page = await client().library('albums', 'recent', 40, 20);

    expect(sentUrl(1).pathname).toBe('/library/sections/3/all');
    expect(Object.fromEntries(sentUrl(1).searchParams)).toEqual({
      type: '9',
      sort: 'addedAt:desc',
      'X-Plex-Container-Start': '40',
      'X-Plex-Container-Size': '20',
    });
    expect(page).toEqual({ total: 120, items: [{ id: '20', title: 'First', artist: 'A', year: '1999', songCount: undefined, coverArt: '20' }] });
  });

  it.each([
    ['artists', '8', { id: '10', name: 'A', albumCount: undefined, coverArt: '10' }],
    ['tracks', '10', expect.objectContaining({ path: `plex:${serverId}:10`, title: 'A' })],
  ] as const)('lists a page of %s with type %s', async (kind, type, item) => {
    reply(container({ Directory: [{ key: '3', type: 'artist' }] }), container({ Metadata: [{ ratingKey: '10', title: 'A', thumb: '/t' }] }));

    const page = await client().library(kind, 'title', 0, 10);

    expect(sentUrl(1).searchParams.get('type')).toBe(type);
    expect(sentUrl(1).searchParams.get('sort')).toBe('titleSort');
    expect(page).toEqual({ total: 1, items: [item] });
  });

  it('has nothing to list without a music library', async () => {
    reply(container({ Directory: [{ key: '1', type: 'movie' }] }));

    expect(await client().library('albums', 'title', 0, 10)).toEqual({ total: 0, items: [] });
  });

  it('shows the picture of the album for a song that has none of its own', async () => {
    reply(
      answer('', 404),
      container({ Metadata: [{ ratingKey: '77', title: 'Song', parentThumb: '/library/metadata/20/thumb/5' }] }),
      answer('img', 200, { 'content-type': 'image/jpeg' })
    );

    await client().cover('77', new AbortController().signal);

    expect(sentUrl(1).pathname).toBe('/library/metadata/77');
    expect(sentUrl(2).pathname).toBe('/library/metadata/20/thumb/5');
  });

  it('fails when neither the song nor its album has a picture', async () => {
    reply(answer('', 404), container({ Metadata: [{ ratingKey: '77', title: 'Song' }] }));

    await expect(client().cover('77', new AbortController().signal)).rejects.toThrow('no picture');
  });
});
