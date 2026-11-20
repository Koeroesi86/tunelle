import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openSource, SourceError } from './source-request';
import { createJellyfinClient } from './jellyfin-client';

vi.mock('./source-request', async (importOriginal) => ({ ...(await importOriginal<typeof import('./source-request')>()), openSource: vi.fn() }));

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const server = { id: serverId, kind: 'jellyfin', name: 'Film room', url: 'https://jf.example.com/media', username: 'me' } as const;
const userAgent = 'Tunelle/1.0';

const answer = (body: string, statusCode = 200, headers: IncomingMessage['headers'] = { 'content-type': 'application/json' }) =>
  Object.assign(Readable.from([Buffer.from(body)]), { statusCode, headers }) as unknown as IncomingMessage;
const json = (body: object, statusCode = 200) => answer(JSON.stringify(body), statusCode);
const login = () => json({ AccessToken: 'token-1', User: { Id: 'u1' } });
const reply = (...responses: IncomingMessage[]) => responses.forEach((response) => vi.mocked(openSource).mockResolvedValueOnce(response));
const sentUrl = (call: number) => vi.mocked(openSource).mock.calls[call][0];
const sentOptions = (call: number) => vi.mocked(openSource).mock.calls[call][1];

const client = () => createJellyfinClient(server, 'sesame', userAgent);

describe('the Jellyfin client', () => {
  beforeEach(() => vi.mocked(openSource).mockReset());

  describe('the login', () => {
    it('posts the user and the password once, and signs the calls with the token, never with the password', async () => {
      reply(login(), json({ Items: [] }), json({ Items: [] }));
      const jellyfin = client();

      await jellyfin.artists();
      await jellyfin.artists();

      expect(vi.mocked(openSource)).toHaveBeenCalledTimes(3);
      expect(sentUrl(0).pathname).toBe('/media/Users/AuthenticateByName');
      expect(sentOptions(0)).toMatchObject({ method: 'POST', body: JSON.stringify({ Username: 'me', Pw: 'sesame' }), headers: { 'User-Agent': userAgent } });
      expect(sentOptions(1)?.headers?.Authorization).toContain('Token="token-1"');
      expect(sentUrl(1).href).not.toContain('sesame');
      expect(sentOptions(1)?.headers?.['User-Agent']).toBe(userAgent);
    });

    it.each([[401], [403]])('is a wrong login for the status %s', async (status) => {
      reply(json({}, status));

      const failure = await client()
        .ping()
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SourceError);
      expect(failure).toMatchObject({ code: 40 });
    });

    it('is an error for an answer without a token', async () => {
      reply(json({ other: true }));

      await expect(client().ping()).rejects.toThrow('jf.example.com did not answer as a Jellyfin server');
    });

    it('logs in again once when the server does not know the token any more', async () => {
      reply(login(), json({}, 401), json({ AccessToken: 'token-2' }), json({ Items: [] }));

      await client().artists();

      expect(sentOptions(3)?.headers?.Authorization).toContain('Token="token-2"');
    });
  });

  describe('an answer that is not good', () => {
    it('is an error that names the host for a status outside 200-299', async () => {
      reply(login(), answer('Bad gateway', 502));

      await expect(client().artists()).rejects.toThrow('jf.example.com answered 502');
    });

    it('is an error for an answer that has not the shape of the call', async () => {
      reply(login(), json({ Items: 'none' }));

      await expect(client().artists()).rejects.toThrow('jf.example.com sent an answer that is not understood');
    });

    it('is an error when the server does not answer', async () => {
      vi.mocked(openSource).mockRejectedValueOnce(new Error('jf.example.com did not answer'));

      await expect(client().ping()).rejects.toThrow('jf.example.com did not answer');
    });
  });

  describe('browsing', () => {
    it('lists the artists, asking for the counts', async () => {
      reply(
        login(),
        json({
          Items: [
            { Id: 'a', Name: 'ABBA', AlbumCount: 3 },
            { Id: 'b', Name: 'Bach' },
          ],
        })
      );

      expect(await client().artists()).toEqual([
        { id: 'a', name: 'ABBA', albumCount: 3 },
        { id: 'b', name: 'Bach', albumCount: 0 },
      ]);
      expect(Object.fromEntries(sentUrl(1).searchParams)).toMatchObject({ includeItemTypes: 'MusicArtist', recursive: 'true', fields: 'ItemCounts' });
    });

    it('lists the albums of an artist, with a cover only where there is a picture', async () => {
      reply(
        login(),
        json({
          Items: [
            { Id: 'al1', Name: 'Goldberg', AlbumArtist: 'Bach', ProductionYear: 1981, ChildCount: 32, ImageTags: { Primary: 'x' } },
            { Id: 'al2', Name: 'Unknown' },
          ],
        })
      );

      expect(await client().albumsOf('b')).toEqual([
        { id: 'al1', title: 'Goldberg', artist: 'Bach', year: '1981', songCount: 32, coverArt: 'al1' },
        { id: 'al2', title: 'Unknown', artist: '', year: '', songCount: 0, coverArt: undefined },
      ]);
      expect(sentUrl(1).searchParams.get('albumArtistIds')).toBe('b');
    });

    it('lists the tracks of an album as tracks of the player, named by the server and the id', async () => {
      reply(
        login(),
        json({
          Items: [
            {
              Id: 's1',
              Name: 'Aria',
              Artists: ['Bach', 'Gould'],
              Album: 'Goldberg',
              IndexNumber: 1,
              ParentIndexNumber: 1,
              ProductionYear: 1981,
              Genres: ['Baroque'],
              RunTimeTicks: 1_800_000_000,
              Container: 'flac',
              MediaSources: [{ Bitrate: 900000 }],
            },
          ],
        })
      );

      expect(await client().tracksOf('al1')).toEqual([
        {
          path: `jellyfin:${serverId}:s1`,
          title: 'Aria',
          artist: 'Bach, Gould',
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
        },
      ]);
      expect(Object.fromEntries(sentUrl(1).searchParams)).toMatchObject({ parentId: 'al1', includeItemTypes: 'Audio' });
    });

    it('searches artists, albums and tracks together', async () => {
      reply(login(), json({ Items: [{ Id: 'a', Name: 'Bach' }] }), json({ Items: [] }), json({ Items: [{ Id: 's1', Name: 'Aria', Container: 'mp3' }] }));

      const found = await client().search('bach');

      expect(found.artists).toHaveLength(1);
      expect(found.tracks[0]).toMatchObject({ title: 'Aria', lossless: 0 });
    });
  });

  describe('the files', () => {
    it('streams the stored file, passes the range on and keeps the token out of the address', async () => {
      reply(login(), answer('audio', 206, { 'content-type': 'audio/flac', 'content-range': 'bytes 0-4/10' }));

      const response = await client().stream('s 1', 'bytes=0-4', new AbortController().signal);

      expect(response.status).toBe(206);
      expect(sentUrl(1).pathname).toBe('/media/Audio/s%201/stream');
      expect(sentUrl(1).searchParams.get('static')).toBe('true');
      expect(sentUrl(1).href).not.toContain('token-1');
      expect(sentOptions(1)?.headers).toMatchObject({ Range: 'bytes=0-4' });
    });

    it('asks for the picture of an item at a size', async () => {
      reply(login(), answer('png', 200, { 'content-type': 'image/png' }));

      const response = await client().cover('al1', new AbortController().signal);

      expect(response.status).toBe(200);
      expect(sentUrl(1).pathname).toBe('/media/Items/al1/Images/Primary');
      expect(sentUrl(1).searchParams.get('maxWidth')).toBe('600');
    });
  });
});
