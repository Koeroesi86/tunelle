import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openSource } from './source-request';
import { createSubsonicClient, SubsonicError } from './subsonic-client';

vi.mock('./source-request', async (importOriginal) => ({ ...(await importOriginal<typeof import('./source-request')>()), openSource: vi.fn() }));

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const server = { id: serverId, kind: 'subsonic', name: 'Home', url: 'https://music.example.com/navidrome', username: 'me' } as const;
const userAgent = 'Tunelle/1.0';

const answer = (body: string, statusCode = 200, headers: IncomingMessage['headers'] = { 'content-type': 'application/json' }) =>
  Object.assign(Readable.from([Buffer.from(body)]), { statusCode, headers }) as unknown as IncomingMessage;
const ok = (content: object = {}) => answer(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...content } }));
const reply = (response: IncomingMessage) => vi.mocked(openSource).mockResolvedValueOnce(response);
const sentUrl = (call = 0) => vi.mocked(openSource).mock.calls[call][0];

const client = () => createSubsonicClient(server, 'sesame', userAgent);

describe('the Subsonic client', () => {
  beforeEach(() => vi.mocked(openSource).mockReset());

  describe('the signing of a call', () => {
    it('sends the user, a token of the password and a salt, and never the password', async () => {
      reply(ok());

      await client().ping();

      const { pathname, searchParams, href } = sentUrl();
      const salt = searchParams.get('s') ?? '';
      expect(pathname).toBe('/navidrome/rest/ping.view');
      expect(salt).toMatch(/^[0-9a-f]{16}$/);
      expect(searchParams.get('t')).toBe(createHash('md5').update(`sesame${salt}`).digest('hex'));
      expect(Object.fromEntries(searchParams)).toMatchObject({ u: 'me', v: '1.16.1', c: 'tunelle', f: 'json' });
      expect(href).not.toContain('sesame');
      expect(searchParams.has('p')).toBe(false);
    });

    it('uses a new salt for each call, and sends the user agent and the pinned certificate', async () => {
      const pinned = createSubsonicClient({ ...server, certificate: 'PEM' }, 'sesame', userAgent);
      reply(ok());
      reply(ok());

      await pinned.ping();
      await pinned.ping();

      expect(sentUrl(0).searchParams.get('s')).not.toBe(sentUrl(1).searchParams.get('s'));
      expect(vi.mocked(openSource).mock.calls[0][1]).toMatchObject({ certificate: 'PEM', headers: { 'User-Agent': userAgent } });
    });
  });

  describe('an answer that is not good', () => {
    it('is an error with the code of the server, although the status is 200', async () => {
      reply(answer(JSON.stringify({ 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } })));

      const failure = await client()
        .ping()
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SubsonicError);
      expect(failure).toMatchObject({ code: 40, message: 'Wrong username or password' });
    });

    it('is an error that names the host for a status outside 200-299', async () => {
      reply(answer('Bad gateway', 502));

      await expect(client().ping()).rejects.toThrow('music.example.com answered 502');
    });

    it.each([['not json'], ['{"other":true}'], ['[]'], ['null']])('is an error for a body that is no answer of a Subsonic server: %s', async (body) => {
      reply(answer(body));

      await expect(client().ping()).rejects.toThrow();
    });

    it('is an error for an answer that has not the shape of the call', async () => {
      reply(ok({ artists: 'none' }));

      await expect(client().artists()).rejects.toThrow('music.example.com sent an answer that is not understood');
    });

    it('is an error when the server does not answer', async () => {
      vi.mocked(openSource).mockRejectedValueOnce(new Error('music.example.com did not answer'));

      await expect(client().ping()).rejects.toThrow('music.example.com did not answer');
    });
  });

  describe('browsing', () => {
    it('lists the artists of all the indexes, and takes a numeric id as text', async () => {
      reply(ok({ artists: { index: [{ artist: [{ id: 1, name: 'ABBA', albumCount: 3 }] }, { artist: [{ id: 'b', name: 'Bach' }] }, {}] } }));

      expect(await client().artists()).toEqual([
        { id: '1', name: 'ABBA', albumCount: 3 },
        { id: 'b', name: 'Bach', albumCount: 0 },
      ]);
    });

    it('has no artists for a server with an empty library', async () => {
      reply(ok({ artists: {} }));

      expect(await client().artists()).toEqual([]);
    });

    it('lists the albums of an artist', async () => {
      reply(
        ok({
          artist: {
            album: [
              { id: 'a1', name: 'Goldberg', artist: 'Bach', year: 1981, songCount: 32, coverArt: 'al-a1' },
              { id: 'a2', name: 'Unknown' },
            ],
          },
        })
      );

      expect(await client().albumsOf('b')).toEqual([
        { id: 'a1', title: 'Goldberg', artist: 'Bach', year: '1981', songCount: 32, coverArt: 'al-a1' },
        { id: 'a2', title: 'Unknown', artist: '', year: '', songCount: 0, coverArt: undefined },
      ]);
      expect(sentUrl().searchParams.get('id')).toBe('b');
    });

    it('lists the tracks of an album as tracks of the player, named by the server and the id', async () => {
      reply(
        ok({
          album: {
            song: [
              {
                id: 's1',
                title: 'Aria',
                artist: 'Bach',
                album: 'Goldberg',
                track: 1,
                discNumber: 1,
                year: 1981,
                genre: 'Baroque',
                duration: 180,
                bitRate: 900,
                suffix: 'flac',
              },
              { id: 's2', title: 'Var 1', suffix: 'mp3' },
            ],
          },
        })
      );

      const [aria, variation] = await client().tracksOf('a1');

      expect(aria).toEqual({
        path: `subsonic:${serverId}:s1`,
        title: 'Aria',
        artist: 'Bach',
        album: 'Goldberg',
        year: '1981',
        track: '1',
        disk: '1',
        genre: 'Baroque',
        picture: null,
        duration: 180,
        codec: 'FLAC',
        bitrate: 900000,
        lossless: 1,
      });
      expect(variation).toMatchObject({ path: `subsonic:${serverId}:s2`, codec: 'MP3', lossless: 0, duration: null, bitrate: null });
    });

    it('searches artists, albums and tracks', async () => {
      reply(ok({ searchResult3: { artist: [{ id: 'b', name: 'Bach' }], song: [{ id: 's1', title: 'Aria' }] } }));

      const found = await client().search('bach');

      expect(found.artists).toEqual([{ id: 'b', name: 'Bach', albumCount: 0 }]);
      expect(found.albums).toEqual([]);
      expect(found.tracks.map(({ path }) => path)).toEqual([`subsonic:${serverId}:s1`]);
      expect(sentUrl().searchParams.get('query')).toBe('bach');
    });
  });

  describe('the audio and the cover', () => {
    const audio = (statusCode: number, headers: IncomingMessage['headers']) => reply(Object.assign(answer('audio-bytes', statusCode, headers)));

    it('asks the file as it is stored, with the range of the player', async () => {
      audio(206, { 'content-type': 'audio/flac', 'content-range': 'bytes 0-9/100' });

      const response = await client().stream('s1', 'bytes=0-9', new AbortController().signal);

      expect(sentUrl().searchParams.get('format')).toBe('raw');
      expect(sentUrl().searchParams.get('id')).toBe('s1');
      expect(vi.mocked(openSource).mock.calls[0][1]).toMatchObject({ headers: { Range: 'bytes=0-9' } });
      expect(response.status).toBe(206);
      expect(await response.text()).toBe('audio-bytes');
    });

    it('sends no range when the player has none', async () => {
      audio(200, { 'content-type': 'audio/flac' });

      await client().stream('s1', undefined, new AbortController().signal);

      expect(vi.mocked(openSource).mock.calls[0][1]?.headers).not.toHaveProperty('Range');
    });

    it.each(['application/json', 'text/xml', 'text/html; charset=utf-8'])(
      'has no file when the server answers with a document (%s) and the status 200',
      async (type) => {
        audio(200, { 'content-type': type });

        const response = await client().stream('missing', undefined, new AbortController().signal);

        expect(response.status).toBe(404);
        expect(response.body).toBeNull();
      }
    );

    it('gives the cover at a size that fits the page', async () => {
      audio(200, { 'content-type': 'image/jpeg' });

      const response = await client().cover('al-a1', new AbortController().signal);

      expect(sentUrl().pathname).toBe('/navidrome/rest/getCoverArt.view');
      expect(sentUrl().searchParams.get('size')).toBe('600');
      expect(response.headers.get('content-type')).toBe('image/jpeg');
    });
  });
});
