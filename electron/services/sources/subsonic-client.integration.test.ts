import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostIdentity, fingerprintOf } from '../../remote/certificate';
import { serveSource } from '../../protocols/source-protocol';
import { readCertificate } from './source-request';
import { createSubsonicClient, SubsonicError } from './subsonic-client';

// what no unit test shows: real sockets, a range that is really cut, and a certificate that is really pinned

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const audio = Buffer.from('0123456789abcdefghij');
const servers: Server[] = [];

const json = (response: ServerResponse, body: object) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } }));
};

/** The file, or the part of it that the range asks for */
const streamRange = (request: IncomingMessage, response: ServerResponse) => {
  const [, from, to] = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '') ?? [];
  const end = to ? Number(to) : audio.length - 1;
  response.statusCode = from ? 206 : 200;
  response.setHeader('Content-Type', 'audio/flac');
  response.setHeader('Accept-Ranges', 'bytes');
  if (from) response.setHeader('Content-Range', `bytes ${from}-${end}/${audio.length}`);
  response.end(audio.subarray(Number(from ?? 0), end + 1));
};

/** A Subsonic server that checks the token, as Navidrome does */
const subsonic = (request: IncomingMessage, response: ServerResponse) => {
  const { pathname, searchParams } = new URL(request.url ?? '/', 'http://localhost');
  const expected = createHash('md5')
    .update(`sesame${searchParams.get('s')}`)
    .digest('hex');
  if (searchParams.get('u') !== 'me' || searchParams.get('t') !== expected) {
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify({ 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } }));
  }

  if (pathname === '/rest/getArtists.view') return json(response, { artists: { index: [{ artist: [{ id: 'b', name: 'Bach', albumCount: 2 }] }] } });
  if (pathname === '/rest/stream.view' && searchParams.get('id') === 'missing') {
    response.setHeader('Content-Type', 'text/xml');
    return response.end('<subsonic-response status="failed"><error code="70"/></subsonic-response>');
  }
  if (pathname === '/rest/stream.view') return streamRange(request, response);

  return json(response, {});
};

const listen = async (server: Server) => {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('The server has no port');
  return address.port;
};

const serverOf = (url: string, certificate?: string) => ({ id: serverId, kind: 'subsonic', name: 'Test', url, username: 'me', certificate }) as const;

describe('the Subsonic client against a server', () => {
  afterEach(() => {
    servers.splice(0).forEach((server) => server.close());
  });

  it('signs a call so that the server accepts it, and says when it does not accept it', async () => {
    const port = await listen(createHttpServer(subsonic));
    const url = `http://127.0.0.1:${port}`;

    expect(await createSubsonicClient(serverOf(url), 'sesame', 'Tunelle/test').artists()).toEqual([{ id: 'b', name: 'Bach', albumCount: 2 }]);
    await expect(createSubsonicClient(serverOf(url), 'wrong', 'Tunelle/test').ping()).rejects.toMatchObject({ constructor: SubsonicError, code: 40 });
  });

  it('plays a range of a track through the route, and has no audio for a file that the server does not have', async () => {
    const port = await listen(createHttpServer(subsonic));
    const client = createSubsonicClient(serverOf(`http://127.0.0.1:${port}`), 'sesame', 'Tunelle/test');
    const sources = { clientOf: async () => client };
    const ask = (id: string, headers: Record<string, string> = {}) =>
      serveSource('audio', `subsonic:${serverId}:${id}`, new Request('tunelle://app/source/audio', { headers }), sources);

    const part = await ask('song-1', { range: 'bytes=5-9' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 5-9/20');
    expect(await part.text()).toBe('56789');

    expect(await (await ask('song-1')).text()).toBe(audio.toString());
    expect((await ask('missing')).status).toBe(404);
  });

  it('does not answer for a server that has stopped, and does not hang', async () => {
    const server = createHttpServer(subsonic);
    const port = await listen(server);
    server.close();
    server.closeAllConnections();

    await expect(createSubsonicClient(serverOf(`http://127.0.0.1:${port}`), 'sesame', 'Tunelle/test').ping()).rejects.toThrow();
  });

  describe('with a self-signed certificate', () => {
    it('refuses it until the user approved it, then accepts that certificate and no other', async () => {
      const identity = createHostIdentity('Music');
      const other = createHostIdentity('Other');
      const port = await listen(createHttpsServer({ cert: identity.certificate, key: identity.key }, subsonic));
      const url = `https://127.0.0.1:${port}`;

      await expect(createSubsonicClient(serverOf(url), 'sesame', 'Tunelle/test').ping()).rejects.toThrow();

      const presented = await readCertificate(new URL(url));
      expect(fingerprintOf(presented)).toBe(fingerprintOf(identity.certificate));
      expect(await createSubsonicClient(serverOf(url, presented), 'sesame', 'Tunelle/test').artists()).toHaveLength(1);
      await expect(createSubsonicClient(serverOf(url, other.certificate), 'sesame', 'Tunelle/test').ping()).rejects.toThrow();
    });
  });
});
