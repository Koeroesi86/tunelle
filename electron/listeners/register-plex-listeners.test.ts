import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import { createPlexPin, listPlexServers, waitForPlexToken } from '../services/sources/plex-account';
import { serveRedirect } from '../services/sources/plex-redirect';
import registerPlexListeners from './register-plex-listeners';

type Listener = (event: IpcMainEvent, payload?: unknown) => unknown;

const listeners = new Map<string, Listener>();
const openExternal = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
  shell: { openExternal: (url: string) => openExternal(url) },
}));
vi.mock('../services/sources/plex-redirect', () => ({ serveRedirect: vi.fn() }));
vi.mock('../services/sources/plex-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/sources/plex-account')>()),
  createPlexPin: vi.fn(),
  waitForPlexToken: vi.fn(),
  listPlexServers: vi.fn(),
}));

const send = vi.fn();
const event = { sender: { send } } as unknown as IpcMainEvent;
const sources = { list: vi.fn(), check: vi.fn(), save: vi.fn() };
const fire = async (channel: string, payload?: unknown) => {
  await listeners.get(channel)?.(event, payload);
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const account = { id: 'm1', name: 'Den', token: 'server-token', urls: ['https://a.plex.direct:32400', 'https://b.plex.direct:32400'] };
const other = { id: 'm2', name: 'Attic', token: 'other-token', urls: ['https://c.plex.direct:32400'] };

describe('registerPlexListeners', () => {
  beforeEach(() => {
    listeners.clear();
    [
      send,
      openExternal,
      ...Object.values(sources),
      vi.mocked(createPlexPin),
      vi.mocked(waitForPlexToken),
      vi.mocked(listPlexServers),
      vi.mocked(serveRedirect),
    ].forEach((fn) => fn.mockReset());
    vi.mocked(createPlexPin).mockResolvedValue({ id: 5, code: 'abcd' });
    vi.mocked(waitForPlexToken).mockResolvedValue('account-token');
    vi.mocked(listPlexServers).mockResolvedValue([account, other]);
    vi.mocked(serveRedirect).mockResolvedValue('http://127.0.0.1:4321/path');
    openExternal.mockResolvedValue(undefined);
    sources.list.mockResolvedValue([]);
    sources.save.mockResolvedValue({});
    registerPlexListeners({ sources } as unknown as ListenerContext);
  });

  it('opens the page of plex.tv, waits, and sends the names of the servers and never a token', async () => {
    await fire('PLEX_SIGN_IN');

    expect(send).toHaveBeenNthCalledWith(1, 'PLEX_ACCOUNT', { status: 'waiting' });
    expect(serveRedirect).toHaveBeenCalledWith(expect.stringContaining('https://app.plex.tv/auth#?clientID='), expect.any(AbortSignal));
    expect(openExternal).toHaveBeenCalledWith('http://127.0.0.1:4321/path');
    expect(send).toHaveBeenLastCalledWith('PLEX_ACCOUNT', {
      status: 'servers',
      servers: [
        { id: 'm1', name: 'Den' },
        { id: 'm2', name: 'Attic' },
      ],
    });
    expect(sources.save).not.toHaveBeenCalled();
    expect(JSON.stringify(send.mock.calls)).not.toContain('token');
  });

  it('adds the only server of the account without another click, and keeps the list when it does not answer', async () => {
    vi.mocked(listPlexServers).mockResolvedValue([account]);
    sources.check.mockRejectedValue(new Error('down'));

    await fire('PLEX_SIGN_IN');

    expect(send).toHaveBeenCalledWith('PLEX_ACCOUNT', { status: 'servers', servers: [{ id: 'm1', name: 'Den' }] });
    expect(send).toHaveBeenLastCalledWith('SOURCE_SERVER_FAILED', { error: 'Den did not answer on any of its addresses' });

    sources.check.mockReset();
    sources.check.mockResolvedValue(undefined);
    await fire('PLEX_SIGN_IN');

    expect(sources.save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'plex', name: 'Den', url: 'https://a.plex.direct:32400' }), 'server-token');
    expect(send).toHaveBeenLastCalledWith('SOURCE_SERVERS_LOADED', { servers: [] });
  });

  it('tells the page when the sign in failed', async () => {
    vi.mocked(waitForPlexToken).mockRejectedValue(new Error('The sign in was not approved in time'));

    await fire('PLEX_SIGN_IN');

    expect(send).toHaveBeenLastCalledWith('PLEX_ACCOUNT', { status: 'failed', error: 'The sign in was not approved in time' });
  });

  it('says nothing of a sign in that the user cancelled', async () => {
    vi.mocked(waitForPlexToken).mockImplementation(
      (_pin, _client, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    );

    await fire('PLEX_SIGN_IN');
    await fire('PLEX_SIGN_IN_CANCEL');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps the first address that answers, with the token of the server', async () => {
    sources.check.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(undefined);
    await fire('PLEX_SIGN_IN');
    send.mockReset();

    await fire('PLEX_SERVER_ADD', { id: 'm1' });

    expect(sources.check).toHaveBeenCalledTimes(2);
    expect(sources.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'plex', name: 'Den', url: 'https://b.plex.direct:32400', username: 'plex' }),
      'server-token'
    );
    expect(send).toHaveBeenCalledWith('SOURCE_SERVERS_LOADED', { servers: [] });
  });

  it('fails when no address answers, and keeps nothing', async () => {
    sources.check.mockRejectedValue(new Error('down'));
    await fire('PLEX_SIGN_IN');
    send.mockReset();

    await fire('PLEX_SERVER_ADD', { id: 'm1' });

    expect(sources.save).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('SOURCE_SERVER_FAILED', { error: 'Den did not answer on any of its addresses' });
  });

  it('does not add a server that the account did not list', async () => {
    await fire('PLEX_SERVER_ADD', { id: 'other' });

    expect(sources.check).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('SOURCE_SERVER_FAILED', { error: 'The server is not known' });
  });
});
