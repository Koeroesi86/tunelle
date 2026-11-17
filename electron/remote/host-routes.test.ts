import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessControl } from './access';
import { createRoutes } from './host-routes';

const access = { request: vi.fn(), authorize: vi.fn() };

const call = async (routes: ReturnType<typeof createRoutes>, method: string, url: string, body = '', headers: Record<string, string> = {}) => {
  const request = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url, headers, socket: { remoteAddress: '10.0.0.2' } });
  const response = { headersSent: false, writeHead: vi.fn(), end: vi.fn() };
  routes.handle(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  await vi.waitFor(() => expect(response.end).toHaveBeenCalled());
  return { status: response.writeHead.mock.calls[0]?.[0], body: response.end.mock.calls[0]?.[0] };
};

const create = () => createRoutes(access as unknown as AccessControl);
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
    expect(access.authorize).toHaveBeenCalledWith('10.0.0.2', 'id', 'secret');

    routes.setNowPlaying({ state: 'playing', title: 'Song', position: 3, at: 1000 });
    expect(JSON.parse((await call(routes, 'GET', '/remote/now-playing', '', approved)).body)).toMatchObject({ state: 'playing', title: 'Song' });
    expect(() => routes.setNowPlaying({ state: 'playing' } as never)).toThrow();
  });

  it('answers 429 to an address that guessed too many secrets', async () => {
    access.authorize.mockReturnValue({ status: 'rate-limited' });

    expect((await call(create(), 'GET', '/remote/now-playing', '', approved)).status).toBe(429);
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
