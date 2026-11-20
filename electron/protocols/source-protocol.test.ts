import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serveSource } from './source-protocol';

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const path = `subsonic:${serverId}:song:1`;
const client = { stream: vi.fn(), cover: vi.fn() };
const clientOf = vi.fn();
const sources = { clientOf };
const ask = (headers: Record<string, string> = {}) => new Request('tunelle://app/source/audio', { headers });

describe('serveSource', () => {
  beforeEach(() => {
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

  it('gives the cover of a track', async () => {
    const response = await serveSource('cover', `subsonic:${serverId}:al-1`, ask(), sources);

    expect(client.cover).toHaveBeenCalledWith('al-1', expect.any(AbortSignal));
    expect(await response.text()).toBe('cover');
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
});
