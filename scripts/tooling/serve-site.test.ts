import type { Server } from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { createSiteServer } from './serve-site';

const release = { tag_name: 'v26.10.14', assets: [{ name: 'Tunelle-Setup-26.10.14-x64.exe', browser_download_url: 'https://example.test/setup.exe' }] };

describe('createSiteServer', () => {
  let server: Server;

  const open = async () => {
    server = createSiteServer(release);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    return `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;
  };

  afterEach(() => new Promise<void>((done) => server.close(() => done())));

  it('serves the page with the release written into it', async () => {
    const response = await fetch(`${await open()}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('https://example.test/setup.exe');
    expect(html).not.toMatch(/\{\{/);
  });

  it.each(['/privacy.html', '/hu/', '/hu/privacy.html'])('serves the page %s', async (path) => {
    const html = await (await fetch(`${await open()}${path}`)).text();

    expect(html).toContain('<html lang=');
    expect(html).not.toMatch(/\{\{/);
  });

  it('serves the other files as they are', async () => {
    const response = await fetch(`${await open()}/style.css`);

    expect(response.headers.get('content-type')).toContain('text/css');
  });

  it.each(['/missing.html', '/%2e%2e/package.json', '/..%2fpackage.json'])('does not serve %s', async (path) => {
    expect((await fetch(`${await open()}${path}`)).status).toBe(404);
  });
});
