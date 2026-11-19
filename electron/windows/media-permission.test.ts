import { describe, expect, it, vi } from 'vitest';

const setPermissionCheckHandler = vi.hoisted(() => vi.fn());
const setPermissionRequestHandler = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ session: { defaultSession: { setPermissionCheckHandler, setPermissionRequestHandler } } }));

const register = async (pageUrl: string | undefined) => {
  const { watchMediaCheck } = await import('./media-permission');
  watchMediaCheck(() => pageUrl);
  return setPermissionCheckHandler.mock.lastCall?.[0];
};

describe('watchMediaCheck', () => {
  it('lets the page of a build see the names of the devices, and nothing else', async () => {
    const check = await register('tunelle://app/index.html');

    expect(check(null, 'media', 'tunelle://app')).toBe(true);
    expect(check(null, 'media', 'https://example.com')).toBe(false);
    expect(check(null, 'geolocation', 'tunelle://app')).toBe(false);
  });

  it('lets the dev server page of a development run see them too', async () => {
    const check = await register('http://localhost:3000/index.html');

    expect(check(null, 'media', 'http://localhost:3000')).toBe(true);
    expect(check(null, 'media', 'http://localhost:4000')).toBe(false);
  });

  it('says no while there is no window, and to an origin that is not an address', async () => {
    expect((await register(undefined))(null, 'media', 'tunelle://app')).toBe(false);
    expect((await register('tunelle://app/index.html'))(null, 'media', '')).toBe(false);
  });

  it('answers a request for media of the page with yes, and any other request with no', async () => {
    await register('tunelle://app/index.html');
    const request = setPermissionRequestHandler.mock.lastCall?.[0];
    const answer = (permission: string, requestingUrl: string) => {
      const callback = vi.fn();
      request(null, permission, callback, { requestingUrl });
      return callback.mock.lastCall?.[0];
    };

    expect(answer('media', 'tunelle://app/index.html')).toBe(true);
    expect(answer('media', 'https://example.com/')).toBe(false);
    expect(answer('notifications', 'tunelle://app/index.html')).toBe(false);
  });
});
