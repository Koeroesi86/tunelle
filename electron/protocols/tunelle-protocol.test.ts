import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { protocol } from 'electron';
import { resolveAlbumArt } from '../library/art/album-art';
import { getCoverAccent } from '../library/art/album-art-accents';
import { serveRemoteAudio, serveRemoteCover } from '../remote/remote-media';
import { fakeDatabase } from '../test-fake-database';
import { libraryRoutes } from './library-routes';
import { serveRadio } from './radio-protocol';
import { serveSource } from './source-protocol';
import { notFound, serveFile } from './serve-file';
import { serveTrack } from './serve-track';
import { handleTunelleProtocol, handleTunelleRequest, registerTunelleScheme, tunelleOrigin } from './tunelle-protocol';

const onHeadersReceived = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived } } },
}));
vi.mock('../library/art/album-art', () => ({ resolveAlbumArt: vi.fn() }));
vi.mock('../library/art/album-art-accents', () => ({ getCoverAccent: vi.fn() }));
vi.mock('../remote/remote-media', () => ({ serveRemoteAudio: vi.fn(), serveRemoteCover: vi.fn() }));
vi.mock('./library-routes', () => ({ libraryRoutes: { '/library': vi.fn() } }));
vi.mock('./radio-protocol', () => ({ serveRadio: vi.fn() }));
vi.mock('./source-protocol', () => ({ serveSource: vi.fn() }));
vi.mock('./serve-file', () => ({ notFound: vi.fn(), serveFile: vi.fn() }));
vi.mock('./serve-track', () => ({ serveTrack: vi.fn() }));

const database = fakeDatabase();
const ok = (body: string) => new Response(body);
const getArt = vi.fn();
const getLogo = vi.fn();
const radio = { resolveStream: vi.fn(), onTitle: vi.fn(), onSampleRate: vi.fn(), getArt, getLogo };
const sources = { clientOf: vi.fn() };
const handle = handleTunelleRequest({ getDatabase: () => database, radio, sources, appRoot: path.resolve('/app/out'), devOrigin: 'http://localhost:3000' });
const ask = (path: string, init?: RequestInit & { host?: string }) => handle(new Request(`tunelle://${init?.host ?? 'app'}${path}`, init));
const key = 'abcdef0123456789';

describe('the tunelle protocol', () => {
  beforeEach(() => {
    vi.mocked(notFound)
      .mockReset()
      .mockImplementation(() => new Response(undefined, { status: 404 }));
    vi.mocked(serveFile).mockReset().mockResolvedValue(ok('file'));
    vi.mocked(serveTrack).mockReset().mockResolvedValue(ok('track'));
    vi.mocked(serveRadio).mockReset().mockResolvedValue(ok('radio'));
    vi.mocked(serveSource).mockReset().mockResolvedValue(ok('source'));
    vi.mocked(libraryRoutes['/library'])
      .mockReset()
      .mockImplementation(async () => ok('library'));
    vi.mocked(resolveAlbumArt).mockReset().mockResolvedValue('/art/a.jpg');
    vi.mocked(getCoverAccent)
      .mockReset()
      .mockResolvedValue(undefined as never);
    getArt.mockReset();
    getLogo.mockReset();
  });

  it('registers the scheme as one the page can fetch and stream from, and handles it', () => {
    registerTunelleScheme();
    handleTunelleProtocol({ getDatabase: () => database, radio, sources, appRoot: '/app' });

    expect(tunelleOrigin).toBe('tunelle://app');
    expect(vi.mocked(protocol.registerSchemesAsPrivileged).mock.calls[0][0][0]).toMatchObject({
      scheme: 'tunelle',
      privileges: { secure: true, stream: true },
    });
    expect(protocol.handle).toHaveBeenCalledWith('tunelle', expect.any(Function));
  });

  it('answers only for its host, and only to GET and HEAD', async () => {
    expect((await ask('/', { host: 'other' })).status).toBe(404);
    expect((await ask('/', { method: 'POST' })).status).toBe(405);
    expect((await ask('/', { method: 'OPTIONS' })).status).toBe(204);
  });

  it('serves the audio and the cover of a track of a server by its path, and nothing else of it', async () => {
    const path = 'subsonic:5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11:42';

    expect((await ask(`/source/audio?path=${encodeURIComponent(path)}`)).status).toBe(200);
    expect((await ask(`/source/cover?path=${encodeURIComponent(path)}`)).status).toBe(200);
    expect(serveSource).toHaveBeenNthCalledWith(1, 'audio', path, expect.any(Request), sources);
    expect(serveSource).toHaveBeenNthCalledWith(2, 'cover', path, expect.any(Request), sources);
  });

  it('allows the dev server to ask across origins, and no other origin', async () => {
    const preflight = await ask('/library', { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
    const response = await ask('/library', { headers: { origin: 'http://localhost:3000' } });
    const other = await ask('/library', { headers: { origin: 'http://evil.example' } });

    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Content-Range');
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('routes the library, the tracks and the remote audio', async () => {
    expect(await (await ask('/library?x=1')).text()).toBe('library');
    expect(await (await ask('/track?path=/m/a.flac')).text()).toBe('track');
    expect(vi.mocked(serveTrack).mock.calls[0][1]).toBe('/m/a.flac');
    vi.mocked(serveRemoteAudio).mockResolvedValue(ok('remote audio'));
    vi.mocked(serveRemoteCover).mockResolvedValue(ok('remote cover'));

    expect(await (await ask('/remote/audio')).text()).toBe('remote audio');
    expect(await (await ask('/remote/cover')).text()).toBe('remote cover');
  });

  it('serves a station with its key, and the art and the logo of a station only for a key that is valid', async () => {
    expect(await (await ask('/radio/abc-1')).text()).toBe('radio');
    expect(serveRadio).toHaveBeenCalledWith('abc-1', expect.anything(), radio);

    getArt.mockReturnValue({ data: Buffer.from('png'), type: 'image/png' });
    getLogo.mockResolvedValue({ data: Buffer.from('jpg'), type: 'image/jpeg' });
    const art = await ask(`/radio-art/${key}`);
    const logo = await ask('/radio-logo/abc-1');

    expect([art.headers.get('Content-Type'), art.headers.get('Cache-Control')]).toEqual(['image/png', 'max-age=3600']);
    expect([logo.headers.get('Content-Type'), logo.headers.get('Cache-Control')]).toEqual(['image/jpeg', 'max-age=86400']);
    expect((await ask('/radio-art/not-a-key')).status).toBe(404);
    expect((await ask('/radio-logo/not a uuid!')).status).toBe(404);
    getArt.mockReturnValue(undefined);
    expect((await ask(`/radio-art/${key}`)).status).toBe(404);
  });

  it('serves album art with the colour of the cover when it is picked, and not found for art that is not there', async () => {
    await ask('/albumart/a.jpg');
    expect(vi.mocked(serveFile).mock.calls[0][2]).toEqual({ 'Cache-Control': 'Public' });

    vi.mocked(getCoverAccent).mockResolvedValue('#112233');
    await ask('/albumart/a.jpg');
    expect(vi.mocked(serveFile).mock.calls[1][2]).toEqual({ 'Cache-Control': 'Public', 'X-Cover-Accent': '#112233' });

    vi.mocked(resolveAlbumArt).mockResolvedValue(undefined as never);
    expect((await ask('/albumart/missing.jpg')).status).toBe(404);
  });

  it('serves the page from the app folder, never a file outside it, and answers 500 for an error', async () => {
    await ask('/');
    await ask('/assets/app.js');
    expect(vi.mocked(serveFile).mock.calls.map(([file]) => file.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/'))).toEqual([
      '/app/out/index.html',
      '/app/out/assets/app.js',
    ]);

    vi.mocked(serveFile).mockClear();
    expect((await ask('/..%2fsecret')).status).toBe(404);
    expect(serveFile).not.toHaveBeenCalled();

    vi.mocked(serveTrack).mockRejectedValue(new Error('broken'));
    expect((await ask('/track?path=/m/a.flac')).status).toBe(500);
  });

  it('adds the content security policy to the response of the page, and of nothing else', () => {
    handleTunelleProtocol({ getDatabase: () => database, radio, sources, appRoot: '/app/out' });
    const [filter, listener] = onHeadersReceived.mock.lastCall ?? [];
    const callback = vi.fn();
    listener({ responseHeaders: { 'Content-Type': ['text/html'] } }, callback);

    const policy = callback.mock.lastCall?.[0].responseHeaders['Content-Security-Policy'].join();

    expect(filter.urls).toEqual(['tunelle://app/', 'tunelle://app/index.html']);
    expect(callback.mock.lastCall?.[0].responseHeaders['Content-Type']).toEqual(['text/html']);
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("'unsafe-eval'");
  });
});
