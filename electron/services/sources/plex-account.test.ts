import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlexPin, listPlexServers, plexSignInUrl, waitForPlexToken } from './plex-account';

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const sent = (call: number) => ({ url: String(fetchMock.mock.calls[call][0]), init: fetchMock.mock.calls[call][1] as RequestInit });

describe('the account of plex.tv', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks for a strong PIN, naming the app and the client', async () => {
    reply({ id: 5, code: 'abcd', authToken: null });

    expect(await createPlexPin('client-1')).toMatchObject({ id: 5, code: 'abcd' });
    expect(sent(0).url).toBe('https://plex.tv/api/v2/pins?strong=true');
    expect(sent(0).init).toMatchObject({
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Plex-Client-Identifier': 'client-1', 'X-Plex-Product': 'Tunelle' },
    });
  });

  it('is an error when plex.tv refuses', async () => {
    reply({}, 429);

    await expect(createPlexPin('client-1')).rejects.toThrow('plex.tv answered 429 to POST /api/v2/pins');
  });

  it('builds the address of the page where the user approves, with the code and the app', () => {
    const url = new URL(plexSignInUrl('client-1', 'abcd'));

    expect(url.origin + url.pathname).toBe('https://app.plex.tv/auth');
    expect(decodeURIComponent(url.hash)).toBe('#?clientID=client-1&code=abcd&context[device][product]=Tunelle');
  });

  it('polls until the PIN carries a token', async () => {
    reply({ id: 5, code: 'abcd', authToken: null });
    reply({ id: 5, code: 'abcd', authToken: 'account-token' });

    const token = waitForPlexToken({ id: 5, code: 'abcd' }, 'client-1', new AbortController().signal);
    await vi.advanceTimersByTimeAsync(2000);

    expect(await token).toBe('account-token');
    expect(sent(1).url).toBe('https://plex.tv/api/v2/pins/5?code=abcd');
  });

  it('gives up after five minutes', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: 5, code: 'abcd', authToken: null }))));

    const token = waitForPlexToken({ id: 5, code: 'abcd' }, 'client-1', new AbortController().signal).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 4000);

    expect(await token).toMatchObject({ message: 'The sign in was not approved in time' });
  });

  it('stops when the sign in is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(waitForPlexToken({ id: 5, code: 'abcd' }, 'client-1', controller.signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the servers with the token of each, local addresses first and relays last', async () => {
    reply([
      {
        name: 'Den',
        clientIdentifier: 'm1',
        provides: 'server',
        accessToken: 'server-token',
        connections: [
          { uri: 'https://relay.plex.direct:8443', relay: true },
          { uri: 'https://remote.plex.direct:32400', local: false },
          { uri: 'https://local.plex.direct:32400', local: true },
        ],
      },
      { name: 'Phone', clientIdentifier: 'p1', provides: 'client,player', connections: [{ uri: 'http://phone' }] },
      { name: 'Empty', clientIdentifier: 'm2', provides: 'server', connections: [] },
      { name: 'Shared', clientIdentifier: 'm3', provides: 'server', connections: [{ uri: 'https://shared.plex.direct:32400' }] },
    ]);

    const servers = await listPlexServers('account-token', 'client-1');

    expect(sent(0).url).toBe('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1');
    expect(sent(0).init).toMatchObject({ headers: { 'X-Plex-Token': 'account-token' } });
    expect(servers).toEqual([
      {
        id: 'm1',
        name: 'Den',
        token: 'server-token',
        urls: ['https://local.plex.direct:32400', 'https://remote.plex.direct:32400', 'https://relay.plex.direct:8443'],
      },
      { id: 'm3', name: 'Shared', token: 'account-token', urls: ['https://shared.plex.direct:32400'] },
    ]);
  });
});
