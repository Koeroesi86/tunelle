import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessControl } from './access';
import { createRoutes } from './host-routes';

const access = { request: vi.fn(), authorize: vi.fn(), authenticate: vi.fn() };

const call = async (routes: ReturnType<typeof createRoutes>, method: string, url: string, body = '', headers: Record<string, string> = {}) => {
  const request = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url, headers, socket: { remoteAddress: '10.0.0.2' } });
  const response = { headersSent: false, writeHead: vi.fn(), end: vi.fn() };
  routes.handle(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  await vi.waitFor(() => expect(response.end).toHaveBeenCalled());
  return { status: response.writeHead.mock.calls[0]?.[0], headers: response.writeHead.mock.calls[0]?.[1] ?? {}, body: response.end.mock.calls[0]?.[0] };
};

const openStream = (routes: ReturnType<typeof createRoutes>) => {
  const response = Object.assign(new EventEmitter(), { headersSent: false, writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), destroy: vi.fn() });
  const request = Object.assign(Readable.from([]), { method: 'GET', url: '/remote/events', headers: approved, socket: { remoteAddress: '10.0.0.2' } });
  routes.handle(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  return response;
};

const commands: unknown[] = [];
const serveAudio = vi.fn();
const create = () => createRoutes(access as unknown as AccessControl, (command) => commands.push(command), serveAudio);
const approved = { 'x-tunelle-device': 'id', authorization: 'Bearer secret' };

describe('createRoutes', () => {
  beforeEach(() => {
    access.request.mockReturnValue({ status: 'pending' });
    access.authorize.mockReturnValue({ status: 'unauthorized' });
  });

  it('hands a request to the access control with the address of the socket, and answers with its status', async () => {
    access.request.mockReturnValue({ status: 'rate-limited' });

    const answer = await call(create(), 'POST', '/remote/request', JSON.stringify({ deviceId: 'x' }));

    expect(access.request).toHaveBeenCalledWith('10.0.0.2', { deviceId: 'x' });
    expect(answer.status).toBe(429);
    expect(JSON.parse(answer.body)).toEqual({ status: 'rate-limited' });
  });

  it.each([
    ['pending', 202],
    ['approved', 200],
    ['invalid', 400],
    ['blocked', 403],
    ['full', 503],
  ])('answers %s with %i', async (status, code) => {
    access.request.mockReturnValue({ status });

    expect((await call(create(), 'POST', '/remote/request', '{}')).status).toBe(code);
  });

  it('treats a body that is not JSON, or too long, as nothing', async () => {
    const routes = create();

    await call(routes, 'POST', '/remote/request', 'not json');
    await call(routes, 'POST', '/remote/request', 'x'.repeat(5000));

    expect(access.request).toHaveBeenNthCalledWith(1, '10.0.0.2', undefined);
    expect(access.request).toHaveBeenNthCalledWith(2, '10.0.0.2', undefined);
  });

  it('answers the now playing to an approved device only, idle until one is set', async () => {
    const routes = create();

    expect((await call(routes, 'GET', '/remote/now-playing', '', approved)).status).toBe(401);

    access.authorize.mockReturnValue({ status: 'ok', device: { id: 'id' } });
    expect(JSON.parse((await call(routes, 'GET', '/remote/now-playing', '', approved)).body)).toEqual({ state: 'idle' });
    expect(Number((await call(routes, 'GET', '/remote/now-playing', '', approved)).headers['x-tunelle-time'])).toBeGreaterThan(0);
    expect(access.authorize).toHaveBeenCalledWith('10.0.0.2', 'id', 'secret');

    routes.setNowPlaying({ state: 'playing', title: 'Song', position: 3, at: 1000 });
    expect(JSON.parse((await call(routes, 'GET', '/remote/now-playing', '', approved)).body)).toMatchObject({ state: 'playing', title: 'Song' });
    expect(() => routes.setNowPlaying({ state: 'playing' } as never)).toThrow();
  });

  it('answers 429 to an address that guessed too many secrets', async () => {
    access.authorize.mockReturnValue({ status: 'rate-limited' });

    expect((await call(create(), 'GET', '/remote/now-playing', '', approved)).status).toBe(429);
  });

  describe('the event stream', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      access.authorize.mockReturnValue({ status: 'ok', device: { id: 'id' } });
      access.authenticate.mockReturnValue({ id: 'id' });
    });

    afterEach(() => vi.useRealTimers());

    it('sends the now playing at once and again on each change, to an approved device only', async () => {
      const routes = create();
      const stream = openStream(routes);
      await vi.waitFor(() => expect(stream.write).toHaveBeenCalledTimes(1));

      routes.setNowPlaying({ state: 'playing', title: 'Song', position: 3, at: 1000 });

      expect(stream.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'content-type': 'text/event-stream' }));
      expect(stream.write).toHaveBeenNthCalledWith(1, 'data: {"state":"idle"}\n\n');
      expect(stream.write.mock.calls[1][0]).toMatch(/^data: \{"state":"playing","title":"Song"/);

      access.authorize.mockReturnValue({ status: 'unauthorized' });
      const refused = await call(routes, 'GET', '/remote/events', '', approved);
      expect(refused.status).toBe(401);
    });

    it('answers 429 to an address with too many wrong secrets, and 503 when the streams are full', async () => {
      access.authorize.mockReturnValue({ status: 'rate-limited' });
      expect((await call(create(), 'GET', '/remote/events', '', approved)).status).toBe(429);

      access.authorize.mockReturnValue({ status: 'ok', device: { id: 'id' } });
      const routes = create();
      Array.from({ length: 20 }, () => openStream(routes));
      expect((await call(routes, 'GET', '/remote/events', '', approved)).status).toBe(503);
    });

    it('ends the stream of a device that was revoked, at the next event or ping', async () => {
      const routes = create();
      const stream = openStream(routes);
      await vi.waitFor(() => expect(stream.write).toHaveBeenCalledTimes(1));

      access.authenticate.mockReturnValue(undefined);
      routes.setNowPlaying({ state: 'idle' });

      expect(stream.destroy).toHaveBeenCalled();
      expect(stream.write).toHaveBeenCalledTimes(1);
    });

    it('ends the stream of a device that was revoked when told so, with no event to carry it', async () => {
      const routes = create();
      const stream = openStream(routes);
      await vi.waitFor(() => expect(stream.write).toHaveBeenCalledTimes(1));
      routes.closeRevoked();
      expect(stream.destroy).not.toHaveBeenCalled();

      access.authenticate.mockReturnValue(undefined);
      routes.closeRevoked();

      expect(stream.destroy).toHaveBeenCalledTimes(1);
    });

    it('pings now and then so a dead peer is found, and stops when the stream closes', async () => {
      const stream = openStream(create());
      await vi.waitFor(() => expect(stream.write).toHaveBeenCalledTimes(1));

      vi.advanceTimersByTime(25_000);
      expect(stream.write).toHaveBeenLastCalledWith(': ping\n\n');

      stream.emit('close');
      vi.advanceTimersByTime(60_000);
      expect(stream.write).toHaveBeenCalledTimes(2);
    });
  });

  describe('the control route', () => {
    const control = (routes: ReturnType<typeof createRoutes>, body: unknown) => call(routes, 'POST', '/remote/control', JSON.stringify(body), approved);
    const allow = (controls: string[]) => access.authorize.mockReturnValue({ status: 'ok', device: { id: 'id', controls } });

    beforeEach(() => {
      commands.length = 0;
    });

    it('passes a command that the host allowed to the page', async () => {
      allow(['skip']);

      expect((await control(create(), { control: 'skip', direction: 'next' })).status).toBe(200);
      expect(commands).toEqual([{ control: 'skip', direction: 'next' }]);
    });

    it.each([
      ['an approved device without that control', ['seek'], { control: 'skip', direction: 'next' }, 403],
      ['a device with no control at all', [], { control: 'playPause' }, 403],
      ['a command that is not one', ['skip'], { control: 'skip', direction: 'sideways' }, 400],
      ['a control that does not exist', ['skip'], { control: 'shutdown' }, 400],
      ['a position below zero', ['seek'], { control: 'seek', position: -1 }, 400],
      ['a volume above one', ['volume'], { control: 'volume', level: 2 }, 400],
    ])('refuses %s and sends nothing to the page', async (_name, controls, body, status) => {
      allow(controls);

      expect((await control(create(), body)).status).toBe(status);
      expect(commands).toEqual([]);
    });

    it('answers 401 to a device that is not approved, whatever it asks', async () => {
      expect((await control(create(), { control: 'skip', direction: 'next' })).status).toBe(401);
      expect(commands).toEqual([]);
    });

    it('toggles play and pause by default', async () => {
      allow(['playPause']);

      await control(create(), { control: 'playPause' });

      expect(commands).toEqual([{ control: 'playPause', action: 'toggle' }]);
    });
  });

  describe('the audio route', () => {
    beforeEach(() => {
      serveAudio.mockReset().mockResolvedValue(new Response('abc', { status: 206, headers: { 'content-range': 'bytes 0-2/9' } }));
      access.authorize.mockReturnValue({ status: 'ok', device: { id: 'id', controls: [] } });
    });

    const audio = async (routes: ReturnType<typeof create>, headers: Record<string, string> = {}) => {
      const request = Object.assign(Readable.from([]), {
        method: 'GET',
        url: '/remote/audio',
        headers: { ...approved, ...headers },
        socket: { remoteAddress: '10.0.0.2' },
      });
      const response = Object.assign(new PassThrough(), { headersSent: false, writeHead: vi.fn() });
      routes.handle(request as unknown as IncomingMessage, response as unknown as ServerResponse);
      await vi.waitFor(() => expect(response.writableEnded).toBe(true));
      return { status: response.writeHead.mock.calls[0]?.[0] };
    };

    it('serves the file of the track that plays, with the range that was asked, and never a path from the request', async () => {
      const routes = create();
      routes.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1000 }, '/music/song.flac');

      const answer = await audio(routes, { range: 'bytes=0-2' });

      expect(answer.status).toBe(206);
      expect(serveAudio).toHaveBeenCalledWith('/music/song.flac', expect.any(Request));
      expect(serveAudio.mock.calls[0][1].headers.get('range')).toBe('bytes=0-2');
    });

    it('has nothing to serve while nothing plays or the page sent no file', async () => {
      const routes = create();

      expect((await audio(routes)).status).toBe(404);

      routes.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1000 });
      expect((await audio(routes)).status).toBe(404);

      routes.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1000 }, '/music/song.flac');
      routes.setNowPlaying({ state: 'idle' }, '/music/song.flac');
      expect((await audio(routes)).status).toBe(404);
      expect(serveAudio).not.toHaveBeenCalled();
    });

    it('serves nothing to a device that is not approved', async () => {
      access.authorize.mockReturnValue({ status: 'unauthorized' });
      const routes = create();
      routes.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1000 }, '/music/song.flac');

      expect((await audio(routes)).status).toBe(401);
      expect(serveAudio).not.toHaveBeenCalled();
    });

    it('never sends the file path to the listener in the now playing', async () => {
      const routes = create();
      routes.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1000 }, '/music/song.flac');

      expect((await call(routes, 'GET', '/remote/now-playing', '', approved)).body).not.toContain('/music');
    });
  });

  it('has no other route or method', async () => {
    const routes = create();

    expect((await call(routes, 'GET', '/remote/request')).status).toBe(404);
    expect((await call(routes, 'POST', '/remote/now-playing')).status).toBe(404);
    expect((await call(routes, 'GET', '/../library')).status).toBe(404);
  });

  it('answers 500 when the access control fails', async () => {
    access.request.mockImplementation(() => {
      throw new Error('broken');
    });

    expect((await call(create(), 'POST', '/remote/request', '{}')).status).toBe(500);
  });
});
