import { describe, expect, it, vi } from 'vitest';

const setPermissionCheckHandler = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ session: { defaultSession: { setPermissionCheckHandler } } }));

const register = async (pageUrl: string | undefined) => {
  const { watchMediaCheck } = await import('./mediaPermission');
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
});
