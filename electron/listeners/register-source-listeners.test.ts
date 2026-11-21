import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import { approvalCode } from '../remote/certificate';
import { readCertificate, SourceError } from '../services/sources/source-request';
import { discoverJellyfin } from '../services/sources/jellyfin-discovery';
import registerSourceListeners from './register-source-listeners';

type Listener = (event: IpcMainEvent, payload?: unknown) => unknown;

const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({ ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) } }));
vi.mock('../services/sources/jellyfin-discovery', () => ({ discoverJellyfin: vi.fn() }));
vi.mock('../remote/certificate', () => ({ approvalCode: vi.fn() }));
vi.mock('../services/sources/source-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/sources/source-request')>()),
  readCertificate: vi.fn(),
}));

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const input = { id: serverId, kind: 'subsonic', name: 'Home', url: 'https://music.example.com/', username: 'me', password: 'sesame' };
const info = { id: serverId, kind: 'subsonic', name: 'Home', url: 'https://music.example.com', username: 'me', protected: true };
const send = vi.fn();
const event = { sender: { send } } as unknown as IpcMainEvent;
const client = { artists: vi.fn(), albumsOf: vi.fn(), tracksOf: vi.fn(), search: vi.fn(), library: vi.fn() };
const sources = { list: vi.fn(), check: vi.fn(), save: vi.fn(), remove: vi.fn(), clientOf: vi.fn() };
const fire = async (channel: string, payload?: unknown) => {
  await listeners.get(channel)?.(event, payload);
};

describe('registerSourceListeners', () => {
  beforeEach(() => {
    listeners.clear();
    [send, ...Object.values(client), ...Object.values(sources), vi.mocked(readCertificate), vi.mocked(approvalCode)].forEach((fn) => fn.mockReset());
    sources.list.mockResolvedValue([info]);
    sources.check.mockResolvedValue(undefined);
    sources.save.mockResolvedValue(info);
    sources.remove.mockResolvedValue(undefined);
    sources.clientOf.mockResolvedValue(client);
    registerSourceListeners({ sources } as unknown as ListenerContext);
  });

  it('sends the servers when the page asks for them', async () => {
    await fire('SOURCE_SERVERS');

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_SERVERS_LOADED', { servers: [info] }));
  });

  it('checks a server before it keeps it, and sends the list with it', async () => {
    await fire('SOURCE_SERVER_SAVE', input);

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_SERVERS_LOADED', { servers: [info] }));
    const { password, ...server } = input;
    expect(sources.check).toHaveBeenCalledWith({ ...server, url: 'https://music.example.com' }, password);
    expect(sources.save).toHaveBeenCalledWith({ ...server, url: 'https://music.example.com' }, password);
    expect(sources.check.mock.invocationCallOrder[0]).toBeLessThan(sources.save.mock.invocationCallOrder[0]);
  });

  it('keeps nothing and says why when the server does not accept the user, with the code of the server', async () => {
    sources.check.mockRejectedValue(new SourceError(40, 'Wrong username or password'));

    await fire('SOURCE_SERVER_SAVE', input);

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_SERVER_FAILED', { id: serverId, error: 'Wrong username or password', code: 40 }));
    expect(sources.save).not.toHaveBeenCalled();
  });

  it('keeps nothing when the server does not answer', async () => {
    sources.check.mockRejectedValue(new Error('music.example.com did not answer'));

    await fire('SOURCE_SERVER_SAVE', input);

    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith('SOURCE_SERVER_FAILED', { id: serverId, error: 'music.example.com did not answer', code: undefined })
    );
    expect(sources.save).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { ...input, url: 'ftp://music.example.com' }, { ...input, password: '' }])('does not take the server %j', async (payload) => {
    await fire('SOURCE_SERVER_SAVE', payload);

    expect(send).toHaveBeenCalledWith('SOURCE_SERVER_FAILED', { error: 'The server is not valid' });
    expect(sources.check).not.toHaveBeenCalled();
  });

  it('sends the Jellyfin servers that answered on the network', async () => {
    const servers = [{ id: 'x', name: 'Film room', url: 'http://192.168.1.5:8096' }];
    vi.mocked(discoverJellyfin).mockResolvedValue(servers);

    await fire('SOURCE_DISCOVER');

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_DISCOVERED', { servers }));
  });

  it('says why the network could not be searched', async () => {
    vi.mocked(discoverJellyfin).mockRejectedValue(new Error('network is unreachable'));

    await fire('SOURCE_DISCOVER');

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_DISCOVERED', { servers: [], error: 'network is unreachable' }));
  });

  it('removes a server and sends the list without it', async () => {
    await fire('SOURCE_SERVER_REMOVE', { id: serverId });

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_SERVERS_LOADED', { servers: [info] }));
    expect(sources.remove).toHaveBeenCalledWith(serverId);
  });

  it('reads the certificate of a server with its code, for the user to approve', async () => {
    vi.mocked(readCertificate).mockResolvedValue('PEM');
    vi.mocked(approvalCode).mockReturnValue('3F9A 04C1');

    await fire('SOURCE_CERTIFICATE', { url: 'https://music.example.com/navidrome' });

    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith('SOURCE_CERTIFICATE_READ', { url: 'https://music.example.com/navidrome', certificate: 'PEM', code: '3F9A 04C1' })
    );
    expect(readCertificate).toHaveBeenCalledWith(new URL('https://music.example.com/navidrome'));
  });

  it('says when the certificate can not be read, and ignores an address that is none', async () => {
    vi.mocked(readCertificate).mockRejectedValue(new Error('music.example.com does not use TLS'));

    await fire('SOURCE_CERTIFICATE', { url: 'http://music.example.com' });
    await fire('SOURCE_CERTIFICATE', { url: 'nope' });

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_SERVER_FAILED', { error: 'music.example.com does not use TLS' }));
    expect(readCertificate).toHaveBeenCalledTimes(1);
  });

  describe('browsing', () => {
    it.each([
      [{ what: 'artists', serverId }, 'artists', []],
      [{ what: 'albums', serverId, id: 'b' }, 'albumsOf', ['b']],
      [{ what: 'tracks', serverId, id: 'a1' }, 'tracksOf', ['a1']],
      [{ what: 'search', serverId, query: 'bach' }, 'search', ['bach']],
      [{ what: 'library', serverId, kind: 'albums', sort: 'recent', start: 50, size: 25 }, 'library', ['albums', 'recent', 50, 25]],
    ] as const)('answers %j from the client', async (request, method, args) => {
      client[method].mockResolvedValue([{ id: 'x' }]);

      await fire('SOURCE_BROWSE', request);

      await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_BROWSED', { request, result: [{ id: 'x' }] }));
      expect(client[method]).toHaveBeenCalledWith(...args);
    });

    it('answers with the error when the server fails', async () => {
      client.artists.mockRejectedValue(new Error('music.example.com answered 500'));
      const request = { what: 'artists', serverId };

      await fire('SOURCE_BROWSE', request);

      await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_BROWSED', { request, error: 'music.example.com answered 500' }));
    });

    it('answers with an error for a server that can not list its library', async () => {
      sources.clientOf.mockResolvedValue({ artists: vi.fn() });
      const request = { what: 'library', serverId, kind: 'albums', sort: 'title', start: 0, size: 10 };

      await fire('SOURCE_BROWSE', request);

      await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_BROWSED', { request, error: 'This kind of server has no library to list' }));
    });

    it.each([
      { kind: 'albums', sort: 'title', start: -1, size: 10 },
      { kind: 'albums', sort: 'title', start: 0, size: 500 },
      { kind: 'genres', sort: 'title', start: 0, size: 10 },
      { kind: 'albums', sort: 'random', start: 0, size: 10 },
    ])('ignores a library page of %j', async (page) => {
      await fire('SOURCE_BROWSE', { what: 'library', serverId, ...page });

      expect(send).not.toHaveBeenCalled();
    });

    it('answers with an error for a server that is not known', async () => {
      sources.clientOf.mockResolvedValue(undefined);
      const request = { what: 'artists', serverId };

      await fire('SOURCE_BROWSE', request);

      expect(send).toHaveBeenCalledWith('SOURCE_BROWSED', { request, error: 'The server is not known' });
    });

    it.each([undefined, { what: 'artists' }, { what: 'albums', serverId }, { what: 'drop', serverId }])('ignores the request %j', async (request) => {
      await fire('SOURCE_BROWSE', request);

      expect(sources.clientOf).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('asks the server once for a request that is on its way, and not for the same again', async () => {
      let answer: (result: unknown[]) => void = () => undefined;
      client.artists.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const request = { what: 'artists', serverId };

      await fire('SOURCE_BROWSE', request);
      await fire('SOURCE_BROWSE', request);
      answer([]);

      await vi.waitFor(() => expect(send).toHaveBeenCalledWith('SOURCE_BROWSED', { request, result: [] }));
      expect(client.artists).toHaveBeenCalledTimes(1);

      await fire('SOURCE_BROWSE', request);
      await vi.waitFor(() => expect(client.artists).toHaveBeenCalledTimes(2));
    });

    it('runs a few requests of a server at a time and the rest as they finish', async () => {
      const answers: ((result: unknown) => void)[] = [];
      client.library.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
      const page = (start: number) => ({ what: 'library', serverId, kind: 'albums', sort: 'recent', start, size: 100 });

      await Promise.all([0, 100, 200, 300, 400, 500].map((start) => fire('SOURCE_BROWSE', page(start))));
      await vi.waitFor(() => expect(client.library).toHaveBeenCalledTimes(4));

      answers[0]({ items: [] });
      await vi.waitFor(() => expect(client.library).toHaveBeenCalledTimes(5));
      answers.slice(1).forEach((resolve) => resolve({ items: [] }));
      await vi.waitFor(() => expect(client.library).toHaveBeenCalledTimes(6));
      answers.forEach((resolve) => resolve({ items: [] }));
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(6));
    });
  });

  describe('keeping the pages that the window wants', () => {
    const page = (start: number) => ({ what: 'library', serverId, kind: 'albums', sort: 'recent', start, size: 100 });

    it('does not fetch a queued page that the window no longer wants, and answers the others', async () => {
      const answers: ((result: unknown) => void)[] = [];
      client.library.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));

      await Promise.all([0, 1, 2, 3, 4, 5, 6].map((index) => fire('SOURCE_BROWSE', page(index * 100))));
      await vi.waitFor(() => expect(client.library).toHaveBeenCalledTimes(4));
      await fire('SOURCE_BROWSE_KEEP', { request: page(0), pages: [5, 6] });
      answers.forEach((resolve) => resolve({ items: [] }));

      await vi.waitFor(() => expect(client.library).toHaveBeenCalledTimes(6));
      answers.forEach((resolve) => resolve({ items: [] }));
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(6));
      expect(client.library.mock.calls.map(([, , start]) => start)).toEqual([0, 100, 200, 300, 500, 600]);
      expect(send).not.toHaveBeenCalledWith('SOURCE_BROWSED', expect.objectContaining({ error: expect.anything() }));
    });

    it('asks again for a page that was dropped', async () => {
      const answers: ((result: unknown) => void)[] = [];
      client.library.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));

      await Promise.all([0, 1, 2, 3, 4].map((index) => fire('SOURCE_BROWSE', page(index * 100))));
      await fire('SOURCE_BROWSE_KEEP', { request: page(0), pages: [] });
      await fire('SOURCE_BROWSE', page(400));
      answers.forEach((resolve) => resolve({ items: [] }));

      await vi.waitFor(() => expect(client.library.mock.calls.map(([, , start]) => start)).toContain(400));
      answers.forEach((resolve) => resolve({ items: [] }));
    });

    it.each([undefined, {}, { request: { what: 'artists', serverId }, pages: [0] }, { request: page(0), pages: ['x'] }])('ignores %j', async (payload) => {
      await fire('SOURCE_BROWSE_KEEP', payload);

      expect(send).not.toHaveBeenCalled();
    });
  });
});
