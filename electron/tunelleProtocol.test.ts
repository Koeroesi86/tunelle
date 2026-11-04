import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Database } from 'sqlite3';
import sharp from 'sharp';
import executeQuery from './executeQuery';
import { createTestDatabase } from './test-database';

// net.fetch of a file slices it for a range, and answers 200 without a Content-Range or a Content-Length
vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  net: {
    fetch: async (url: string, { headers }: { headers: Record<string, string> }) => {
      const data = fs.readFileSync(fileURLToPath(url));
      const range = headers.range?.match(/^bytes=(\d+)-(\d+)$/);
      return new Response(range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data);
    },
  },
}));

const { handleTunelleRequest } = await import('./tunelleProtocol');

describe('tunelle protocol', () => {
  let database: Database;
  let folder: string;
  let appRoot: string;
  const libraryFile = () => path.join(folder, 'library.flac');
  const handle = (devOrigin?: string) =>
    handleTunelleRequest({
      getDatabase: () => database,
      appRoot,
      devOrigin,
      radio: {
        resolveStream: () => Promise.reject(new Error('no radio')),
        onTitle: () => {},
        getLogo: async (uuid) => (uuid === 'abc-1' ? { type: 'image/png', data: Buffer.from('logo') } : undefined),
        getArt: (key) => (key === 'abcdef0123456789' ? { type: 'image/png', data: Buffer.from('cover') } : undefined),
      },
    });
  const get = (route: string, init?: RequestInit) => handle()(new Request(`tunelle://app${route}`, init));
  const track = (file: string, headers?: Record<string, string>) => get(`/track?path=${encodeURIComponent(file)}`, { headers });
  const insert = (file: string) =>
    new Promise<void>((resolve, reject) => database.run('INSERT INTO library (path) VALUES (?)', [file], (err) => (err ? reject(err) : resolve())));

  beforeAll(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-protocol-'));
    appRoot = path.join(folder, 'build');
    fs.mkdirSync(path.join(appRoot, 'bundle'), { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(appRoot, 'bundle', 'main.js'), 'console.log(1)');
    fs.writeFileSync(libraryFile(), 'audio');
    fs.writeFileSync(path.join(folder, 'secret.txt'), 'secret');
    database = await createTestDatabase();
    await insert(libraryFile());
    global._database = database;
    global._appDataPath = folder;
  });

  afterAll(() => {
    global._database = undefined;
    fs.rmSync(folder, { recursive: true, force: true });
  });

  describe('the page', () => {
    it('serves the index page for the root and by its name, with its type', async () => {
      for (const route of ['/', '/index.html']) {
        const response = await get(route);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(await response.text()).toBe('<html></html>');
      }
    });

    it('serves the files of the page with the type of their extension', async () => {
      expect((await get('/bundle/main.js')).headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    });

    it.each(['/missing.html', '/bundle', '/..%2Fsecret.txt', '/%2e%2e/secret.txt', '/bundle/..%2F..%2Fsecret.txt'])('does not serve %s', async (route) => {
      expect((await get(route)).status).toBe(404);
    });
  });

  describe('the scheme', () => {
    it('does not serve another host', async () => {
      expect((await handle()(new Request('tunelle://other/index.html'))).status).toBe(404);
    });

    it.each(['POST', 'PUT', 'DELETE'])('does not take a %s', async (method) => {
      expect((await get('/library', { method })).status).toBe(405);
    });
  });

  describe('cross-origin access of a development run', () => {
    const from = (origin: string, devOrigin?: string, method = 'GET') =>
      handle(devOrigin)(new Request('tunelle://app/library', { method, headers: { origin } }));

    it('allows the origin of the dev server', async () => {
      const response = await from('http://localhost:3000', 'http://localhost:3000');

      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(response.headers.get('vary')).toBe('Origin');
    });

    it('answers the preflight of the dev server', async () => {
      const response = await from('http://localhost:3000', 'http://localhost:3000', 'OPTIONS');

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-headers')).toContain('Range');
    });

    it.each(['https://example.com', 'http://localhost.example.com', 'http://localhost:3001'])('does not allow the origin %s', async (origin) => {
      expect((await from(origin, 'http://localhost:3000')).headers.get('access-control-allow-origin')).toBeNull();
    });

    it('allows no origin outside of a development run', async () => {
      expect((await from('http://localhost:3000')).headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('tracks', () => {
    it('serves a file of the library with its size and type', async () => {
      const response = await track(libraryFile());

      expect(response.status).toBe(200);
      expect(response.headers.get('content-length')).toBe('5');
      expect(response.headers.get('content-type')).toContain('audio/x-flac');
      expect(await response.text()).toBe('audio');
    });

    it('does not serve a file outside of the library', async () => {
      expect((await track(path.join(folder, 'secret.txt'))).status).toBe(404);
    });

    it('does not serve a path that traverses out of the library', async () => {
      expect((await track(path.join(folder, '..', path.basename(folder), 'secret.txt'))).status).toBe(404);
    });

    it('does not serve before the database is connected', async () => {
      const response = await handleTunelleRequest({
        getDatabase: () => undefined,
        appRoot,
        radio: { resolveStream: () => Promise.reject(new Error('no radio')), onTitle: () => {} },
      })(new Request(`tunelle://app/track?path=${encodeURIComponent(libraryFile())}`));

      expect(response.status).toBe(404);
    });

    describe('range requests', () => {
      it('serves a byte range', async () => {
        const response = await track(libraryFile(), { range: 'bytes=1-2' });

        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe('bytes 1-2/5');
        expect(response.headers.get('content-length')).toBe('2');
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(await response.text()).toBe('ud');
      });

      it('serves a suffix range', async () => {
        const response = await track(libraryFile(), { range: 'bytes=-2' });

        expect(response.status).toBe(206);
        expect(await response.text()).toBe('io');
      });

      it('clamps an end past the file', async () => {
        expect((await track(libraryFile(), { range: 'bytes=3-100' })).headers.get('content-range')).toBe('bytes 3-4/5');
      });

      it.each(['bytes=10-20', 'bytes=-', 'bytes=3-1', 'items=0-1'])('rejects the unsatisfiable range %s', async (range) => {
        const response = await track(libraryFile(), { range });

        expect(response.status).toBe(416);
        expect(response.headers.get('content-range')).toBe('bytes */5');
      });

      it('answers 404 when the file vanished after the scan', async () => {
        const missing = path.join(folder, 'missing.flac');
        await insert(missing);

        expect((await track(missing)).status).toBe(404);
        expect((await track(missing, { range: 'bytes=0-1' })).status).toBe(404);
      });
    });
  });

  describe('album art', () => {
    it('answers 404 for an optimized album art without a source image', async () => {
      fs.mkdirSync(path.join(folder, 'albumart'), { recursive: true });

      expect((await get('/albumart/nothing-optimized.png')).status).toBe(404);
    });

    it('sends the stored colour of a cover with it, and none while it is not picked', async () => {
      const albumArt = path.join(folder, 'albumart');
      fs.mkdirSync(albumArt, { recursive: true });
      await sharp({ create: { width: 300, height: 300, channels: 3, background: 'red' } })
        .png()
        .toFile(path.join(albumArt, 'tinted-abc.png'));

      expect((await get('/albumart/tinted-abc-optimized.png')).headers.get('X-Cover-Accent')).toBeNull();

      await executeQuery(database, { query: 'INSERT INTO album_art (picture, accent) VALUES (?, ?)', variables: ['tinted-abc.png', '#dc2828'] });
      expect((await get('/albumart/tinted-abc-optimized.png')).headers.get('X-Cover-Accent')).toBe('#dc2828');
    });

    it('answers concurrent requests for an optimized album art with the complete image', async () => {
      const albumArt = path.join(folder, 'albumart');
      fs.mkdirSync(albumArt, { recursive: true });
      await sharp({ create: { width: 1200, height: 1200, channels: 3, background: 'red' } })
        .png()
        .toFile(path.join(albumArt, 'concurrent-abc.png'));

      const responses = await Promise.all(Array.from({ length: 8 }, () => get('/albumart/concurrent-abc-optimized.png')));
      const sizes = await Promise.all(
        responses.map(async (response) => {
          const { width } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
          return { status: response.status, type: response.headers.get('content-type'), width };
        })
      );

      expect(sizes).toEqual(Array.from({ length: 8 }, () => ({ status: 200, type: 'image/png', width: 250 })));
      expect(fs.readdirSync(albumArt).filter((file) => file.endsWith('.part'))).toEqual([]);
    });
  });

  describe('radio logos', () => {
    it('serves the logo of a station by its uuid and answers 404 to anything else', async () => {
      const found = await get('/radio-logo/abc-1');

      expect(found.status).toBe(200);
      expect(found.headers.get('content-type')).toContain('image/png');
      expect(await found.text()).toBe('logo');
      expect((await get('/radio-logo/other')).status).toBe(404);
      expect((await get('/radio-logo/..%2Fsecret')).status).toBe(404);
    });
  });

  describe('radio art', () => {
    it('serves the art by its key and answers 404 to anything else', async () => {
      const found = await get('/radio-art/abcdef0123456789');

      expect(found.status).toBe(200);
      expect(found.headers.get('content-type')).toContain('image/png');
      expect(await found.text()).toBe('cover');
      expect((await get('/radio-art/0000000000000000')).status).toBe(404);
      expect((await get('/radio-art/..%2Fsecret')).status).toBe(404);
    });
  });

  describe('the library', () => {
    it('answers with the library', async () => {
      const response = await get('/library');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({ path: libraryFile() })]));
    });

    it('is not served before the database is connected', async () => {
      const response = await handleTunelleRequest({
        getDatabase: () => undefined,
        appRoot,
        radio: { resolveStream: () => Promise.reject(new Error('no radio')), onTitle: () => {} },
      })(new Request('tunelle://app/library'));

      expect(response.status).toBe(403);
    });

    it('answers with a page of tracks and the total', async () => {
      const body = await (await get('/library/tracks?offset=0&limit=1')).json();

      expect(body.items).toHaveLength(1);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });

    it('answers with a page of albums and the tracks of an album', async () => {
      const { items, total } = await (await get('/library/albums?limit=5')).json();
      expect(total).toBeGreaterThanOrEqual(1);

      const tracks = await (await get(`/library/album?path=${encodeURIComponent(items[0].path)}&title=${encodeURIComponent(items[0].title ?? '')}`)).json();
      expect(tracks).toHaveLength(items[0].trackCount);
    });

    it('limits the page size and falls back for a bad window', async () => {
      expect((await (await get('/library/tracks?offset=-4&limit=100000')).json()).items.length).toBeLessThanOrEqual(500);
    });

    it('sorts and filters by the folders of the request', async () => {
      const inFolder = `folder=${encodeURIComponent(folder)}`;
      const elsewhere = `folder=${encodeURIComponent(path.join(folder, 'elsewhere'))}`;

      expect((await (await get(`/library/tracks?sort=title&dir=desc&${inFolder}`)).json()).total).toBeGreaterThanOrEqual(1);
      expect((await (await get(`/library/tracks?${elsewhere}`)).json()).total).toBe(0);
      expect((await (await get(`/library/tracks?${elsewhere}&${inFolder}`)).json()).total).toBeGreaterThanOrEqual(1);
      expect((await (await get(`/library/albums?sort=trackCount&dir=asc&${inFolder}`)).json()).total).toBeGreaterThanOrEqual(1);
      expect(await (await get(`/library?sort=year&dir=asc&${elsewhere}`)).json()).toEqual([]);
    });

    it('searches the library for the text of the request', async () => {
      const file = path.join(folder, 'searched.flac');
      await new Promise<void>((resolve, reject) =>
        database.run('INSERT INTO library (path, title_key) VALUES (?, ?)', [file, 'needle'], (err) => (err ? reject(err) : resolve()))
      );

      const { items, total } = await (await get('/library/tracks?search=NEEDLE')).json();
      const albums = await (await get('/library/albums?search=needle')).json();
      const library = await (await get('/library?search=needle')).json();
      const nothing = await (await get('/library/tracks?search=haystack')).json();
      await new Promise<void>((resolve) => database.run('DELETE FROM library WHERE path = ?', [file], () => resolve()));

      expect([total, items[0].path]).toEqual([1, file]);
      expect(albums.total).toBe(1);
      expect(library).toHaveLength(1);
      expect(nothing.total).toBe(0);
    });

    it.each([
      '/library/tracks?sort=nope&dir=asc',
      '/library/tracks?sort=title&dir=up',
      '/library/tracks?sort=title',
      '/library/albums?sort=track&dir=asc',
      '/library?sort=x&dir=asc',
    ])('rejects the sort of %s that is not a known field with a known direction', async (route) => {
      expect((await get(route)).status).toBe(400);
    });

    it('rejects an album request without a folder and a title', async () => {
      expect((await get('/library/album')).status).toBe(400);
    });
  });
});
