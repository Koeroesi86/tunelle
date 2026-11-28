// Needs the real network: the server of the redirect answers a request
import { describe, expect, it } from 'vitest';
import { serveRedirect } from './plex-redirect';

describe('serveRedirect (a real server)', () => {
  it('redirects to the target with its & kept, and refuses a guess', async () => {
    const controller = new AbortController();
    const target = 'https://app.plex.tv/auth#?clientID=a&code=b&context%5Bdevice%5D%5Bproduct%5D=Tunelle';
    const address = await serveRedirect(target, controller.signal);

    const found = await fetch(address, { redirect: 'manual' });
    const guess = await fetch(`${new URL(address).origin}/`, { redirect: 'manual' });
    controller.abort();

    expect(found.status).toBe(302);
    expect(found.headers.get('location')).toBe(target);
    expect(guess.status).toBe(404);
  });
});
