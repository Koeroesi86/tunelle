// Needs the real network: logins, ranges and a stopped server over sockets
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { afterEach, describe, expect, it } from 'vitest';
import { serveSource } from '../../protocols/source-protocol';
import { createJellyfinClient } from './jellyfin-client';
import { createPlexClient } from './plex-client';

// what no unit test shows: a login or a token over real sockets, a range that is really cut, and a server that stops

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const audio = Buffer.from('0123456789abcdefghij');
const servers: Server[] = [];

const json = (response: ServerResponse, body: object) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));

/** The file, or the part of it that the range asks for */
const streamRange = (request: IncomingMessage, response: ServerResponse) => {
  const [, from, to] = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '') ?? [];
  const start = Number(from ?? 0);
  const end = to ? Number(to) : audio.length - 1;
  const partial = from ? { 'content-range': `bytes ${start}-${end}/${audio.length}` } : {};
  response.writeHead(from ? 206 : 200, { 'content-type': 'audio/flac', 'accept-ranges': 'bytes', ...partial }).end(audio.subarray(start, end + 1));
};

/** A Jellyfin server: the password gets a token, and every other call needs that token */
const jellyfin = async (request: IncomingMessage, response: ServerResponse) => {
  const { pathname, searchParams } = new URL(request.url ?? '/', 'http://jellyfin.test');
  if (pathname === '/Users/AuthenticateByName') {
    const accepted = (await text(request)) === JSON.stringify({ Username: 'me', Pw: 'sesame' });
    return accepted ? json(response, { AccessToken: 'token-1' }) : response.writeHead(401).end();
  }
  if (!request.headers.authorization?.includes('Token="token-1"')) return response.writeHead(401).end();
  if (pathname === '/Items' && searchParams.get('parentId') === 'album-1') return json(response, { Items: [{ Id: 'song-1', Name: 'Aria' }] });
  if (pathname === '/Audio/song-1/stream' && searchParams.get('static') === 'true') return streamRange(request, response);

  return response.writeHead(404, { 'content-type': 'application/json' }).end('{}');
};

const song = { ratingKey: 'song-1', title: 'Aria' };

const plexLists = new Map<string, object[]>([
  ['/library/sections', []],
  ['/library/metadata/album-1/children', [song]],
  ['/library/metadata/song-1', [{ ...song, Media: [{ Part: [{ key: '/library/parts/1/file.flac' }] }] }]],
  ['/library/metadata/missing', [{ ratingKey: 'missing', title: 'Gone' }]],
]);

/** A Plex server: every call needs the token, and the file of a song is a part that the song names */
const plex = (request: IncomingMessage, response: ServerResponse) => {
  if (request.headers['x-plex-token'] !== 'sesame') return response.writeHead(401).end();

  const { pathname } = new URL(request.url ?? '/', 'http://plex.test');
  if (pathname === '/library/parts/1/file.flac') return streamRange(request, response);

  const list = plexLists.get(pathname);
  return list ? json(response, { MediaContainer: { Metadata: list } }) : response.writeHead(404).end();
};

const listen = async (server: Server) => {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('The server has no port');
  return `http://127.0.0.1:${address.port}`;
};

const serverOf = <Kind extends 'jellyfin' | 'plex'>(kind: Kind, url: string) => ({ id: serverId, kind, name: 'Test', url, username: 'me' });

const kinds = [
  {
    kind: 'jellyfin',
    answer: jellyfin,
    clientOf: (url: string, secret: string) => createJellyfinClient(serverOf('jellyfin', url), secret, 'Tunelle/test'),
    // the server says that it has no such file
    missing: 404,
  },
  {
    kind: 'plex',
    answer: plex,
    clientOf: (url: string, secret: string) => createPlexClient(serverOf('plex', url), secret, 'Tunelle/test'),
    // the song names no file, so there is nothing to ask the server for
    missing: 502,
  },
] as const;

describe.each(kinds)('the $kind client against a server', ({ kind, answer, clientOf, missing }) => {
  afterEach(() => {
    servers.splice(0).forEach((server) => server.close());
  });

  it('is accepted with the right secret, and says when it is not', async () => {
    const url = await listen(createServer(answer));

    expect(await clientOf(url, 'sesame').tracksOf('album-1')).toMatchObject([{ title: 'Aria', path: `${kind}:${serverId}:song-1` }]);
    await expect(clientOf(url, 'wrong').ping()).rejects.toMatchObject({ code: expect.any(Number) });
  });

  it('plays a range of a track through the route, and has no audio for a file that the server does not have', async () => {
    const client = clientOf(await listen(createServer(answer)), 'sesame');
    const ask = (id: string, headers: Record<string, string> = {}) =>
      serveSource('audio', `${kind}:${serverId}:${id}`, new Request('tunelle://app/source/audio', { headers }), { clientOf: async () => client });

    const part = await ask('song-1', { range: 'bytes=5-9' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 5-9/20');
    expect(await part.text()).toBe('56789');

    expect(await (await ask('song-1')).text()).toBe(audio.toString());
    expect((await ask('missing')).status).toBe(missing);
  });

  it('answers that a server that has stopped is not there, and does not hang', async () => {
    const server = createServer(answer);
    const client = clientOf(await listen(server), 'sesame');
    const ask = () => serveSource('audio', `${kind}:${serverId}:song-1`, new Request('tunelle://app/source/audio'), { clientOf: async () => client });
    expect(await (await ask()).text()).toBe(audio.toString());

    server.close();
    server.closeAllConnections();

    expect((await ask()).status).toBe(502);
  });
});
