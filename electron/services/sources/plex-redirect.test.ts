import { afterEach, describe, expect, it, vi } from 'vitest';
import { serveRedirect } from './plex-redirect';

type Handler = (request: { url: string }, response: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }) => unknown;

const created = vi.hoisted(() => ({ handler: undefined as unknown, server: undefined as unknown }));

vi.mock('node:http', () => ({
  createServer: (handler: unknown) => {
    created.handler = handler;
    const server = {
      once: vi.fn(),
      listen: vi.fn((_port: number, _host: string, done: () => void) => done()),
      address: vi.fn(() => ({ port: 4321 })),
      close: vi.fn(),
      closeAllConnections: vi.fn(),
    };
    created.server = server;
    return server;
  },
}));

const respond = () => {
  const response = { writeHead: vi.fn(), end: vi.fn() };
  response.writeHead.mockReturnValue(response);
  return response;
};

const closed = () => (created.server as { close: { mock: { calls: unknown[] } } }).close.mock.calls.length;

describe('serveRedirect', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives a loopback address under a path of its own and redirects it to the target', async () => {
    const address = await serveRedirect('https://app.plex.tv/auth#?a=1&b=2', new AbortController().signal);
    const response = respond();

    (created.handler as Handler)({ url: new URL(address).pathname }, response);

    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:4321\/[0-9a-f]{32}$/);
    expect(address).not.toContain('&');
    expect(response.writeHead).toHaveBeenCalledWith(302, expect.objectContaining({ Location: 'https://app.plex.tv/auth#?a=1&b=2' }));
  });

  it('answers any other path with 404', async () => {
    await serveRedirect('https://app.plex.tv/auth', new AbortController().signal);
    const response = respond();

    (created.handler as Handler)({ url: '/' }, response);

    expect(response.writeHead).toHaveBeenCalledWith(404);
  });

  it('stops when the sign in is cancelled', async () => {
    const controller = new AbortController();
    await serveRedirect('https://app.plex.tv/auth', controller.signal);

    controller.abort();

    expect(closed()).toBe(1);
  });

  it('stops after five minutes', async () => {
    const timeout = new AbortController();
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    await serveRedirect('https://app.plex.tv/auth', new AbortController().signal);

    timeout.abort();

    expect(spy).toHaveBeenCalledWith(5 * 60 * 1000);
    expect(closed()).toBe(1);
  });
});
