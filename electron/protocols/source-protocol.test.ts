import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serveSource } from './source-protocol';
import { downloadSource } from './source-download';
import { servePlayable } from './serve-track';

vi.mock('./source-download', () => ({ downloadSource: vi.fn() }));
vi.mock('./serve-track', () => ({ servePlayable: vi.fn() }));

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const path = `subsonic:${serverId}:song:1`;
const client = { stream: vi.fn(), cover: vi.fn() };
const clientOf = vi.fn();
const sources = { clientOf };
const ask = (headers: Record<string, string> = {}, query = '') => new Request(`tunelle://app/source/audio${query}`, { headers });

describe('serveSource', () => {
  beforeEach(() => {
    vi.mocked(downloadSource).mockReset();
    vi.mocked(servePlayable).mockReset().mockResolvedValue(new Response('wav'));
    client.stream.mockReset().mockResolvedValue(new Response('audio', { status: 206 }));
    client.cover.mockReset().mockResolvedValue(new Response('cover'));
    clientOf.mockReset().mockResolvedValue(client);
  });

  it('plays the track of a server with the range of the request', async () => {
    const request = ask({ range: 'bytes=10-' });

    const response = await serveSource('audio', path, request, sources);

    expect(clientOf).toHaveBeenCalledWith(serverId);
    expect(client.stream).toHaveBeenCalledWith('song:1', 'bytes=10-', request.signal);
    expect(response.status).toBe(206);
  });

  it('plays from the start when the request has no range', async () => {
    await serveSource('audio', path, ask(), sources);

    expect(client.stream).toHaveBeenCalledWith('song:1', undefined, expect.any(AbortSignal));
  });

  it('downloads a track in a codec that ffmpeg decodes and serves it like a file of the library', async () => {
    vi.mocked(downloadSource).mockResolvedValue('/temp/track.src');
    const request = ask({}, '?codec=ALAC&bitDepth=24');

    expect(await (await serveSource('audio', path, request, sources)).text()).toBe('wav');
    expect(downloadSource).toHaveBeenCalledWith(path, client, 'song:1', request.signal);
    expect(servePlayable).toHaveBeenCalledWith({ path: '/temp/track.src', codec: 'ALAC', bitDepth: 24 }, request);
    expect(client.stream).not.toHaveBeenCalled();
  });

  it('plays the stream of the server when the download fails', async () => {
    vi.mocked(downloadSource).mockResolvedValue(undefined);

    await serveSource('audio', path, ask({}, '?codec=ALAC'), sources);

    expect(client.stream).toHaveBeenCalledWith('song:1', undefined, expect.any(AbortSignal));
  });

  it('leaves a codec that ffmpeg does not decode to Chromium', async () => {
    await serveSource('audio', path, ask({}, '?codec=AAC'), sources);

    expect(downloadSource).not.toHaveBeenCalled();
    expect(client.stream).toHaveBeenCalled();
  });

  it('gives the cover of a track', async () => {
    const response = await serveSource('cover', `subsonic:${serverId}:al-1`, ask(), sources);

    expect(client.cover).toHaveBeenCalledWith('al-1', expect.any(AbortSignal));
    expect(await response.text()).toBe('cover');
  });

  it('lets the page keep a cover for a day and not an answer that is an error', async () => {
    const kept = await serveSource('cover', `subsonic:${serverId}:al-1`, ask(), sources);
    client.cover.mockResolvedValue(new Response('slow down', { status: 429 }));
    const refused = await serveSource('cover', `subsonic:${serverId}:al-2`, ask(), sources);

    expect(kept.headers.get('Cache-Control')).toBe('private, max-age=86400');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers 502 when the server does not answer for a cover', async () => {
    client.cover.mockRejectedValue(new Error('gone'));

    const response = await serveSource('cover', `subsonic:${serverId}:al-1`, ask(), sources);

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([null, '', '/music/a.flac', 'radio:abc', 'subsonic:not-a-server:1', `tidal:${serverId}:1`])(
    'is not found for the path %j, and no server is asked',
    async (bad) => {
      expect((await serveSource('audio', bad, ask(), sources)).status).toBe(404);
      expect(clientOf).not.toHaveBeenCalled();
    }
  );

  it('is not found for a server that the user has not added', async () => {
    clientOf.mockResolvedValue(undefined);

    expect((await serveSource('audio', path, ask(), sources)).status).toBe(404);
    expect(client.stream).not.toHaveBeenCalled();
  });

  it('is a bad gateway when the server does not answer, and does not throw into the main process', async () => {
    client.stream.mockRejectedValue(new Error('music.example.com did not answer'));
    client.cover.mockRejectedValue(new Error('self signed certificate'));

    expect((await serveSource('audio', path, ask(), sources)).status).toBe(502);
    expect((await serveSource('cover', path, ask(), sources)).status).toBe(502);
  });

  it('does not fetch a cover that was asked for no more while it waited for its turn', async () => {
    const answers: ((response: Response) => void)[] = [];
    client.cover.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const asked = Array.from({ length: 8 }, (_, index) => {
      const controller = new AbortController();
      const response = serveSource(
        'cover',
        `subsonic:${serverId}:al-${index}`,
        new Request('tunelle://app/source/cover', { signal: controller.signal }),
        sources
      );
      return { controller, response };
    });
    await vi.waitFor(() => expect(client.cover).toHaveBeenCalledTimes(6));

    asked[6].controller.abort();
    answers.forEach((resolve) => resolve(new Response('cover')));
    await vi.waitFor(() => expect(client.cover).toHaveBeenCalledTimes(7));
    answers.forEach((resolve) => resolve(new Response('cover')));

    expect((await asked[6].response).status).toBe(502);
    expect((await asked[7].response).status).toBe(200);
    expect(client.cover.mock.calls.map(([id]) => id)).not.toContain('al-6');
  });
});
