import { describe, expect, it, vi } from 'vitest';

const setPermissionCheckHandler = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ session: { defaultSession: { setPermissionCheckHandler } } }));

describe('registerMediaPermission', () => {
  it('lets the page of the app see the names of the devices, and nothing else', async () => {
    const { default: registerMediaPermission } = await import('./mediaPermission');
    registerMediaPermission();
    const check = setPermissionCheckHandler.mock.calls[0][0];

    expect(check(null, 'media', 'tunelle://app')).toBe(true);
    expect(check(null, 'media', 'https://example.com')).toBe(false);
    expect(check(null, 'geolocation', 'tunelle://app')).toBe(false);
  });
});
