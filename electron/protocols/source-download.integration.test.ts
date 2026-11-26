import fs from 'fs';
import { createServer, type Server } from 'http';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSubsonicClient } from '../services/sources/subsonic-client';
import { cacheFolder } from './cache-folder';
import { downloadSource, stalled } from './source-download';

const temp = vi.hoisted(() => ({ folder: '' }));
vi.mock('electron', () => ({ app: { getPath: () => temp.folder } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

// That ending a request fails the body of its answer is a thing of Node's HTTP client, which a faked server does not show
describe('downloadSource from a real server', () => {
  let server: Server;
  let closed = false;

  beforeAll(async () => {
    temp.folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-download-test-'));
    server = createServer((request, response) => {
      request.socket.on('close', () => (closed = true));
      response.writeHead(200, { 'Content-Type': 'audio/flac', 'Content-Length': '100' });
      response.write('a part of the file');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(() => {
    vi.useRealTimers();
    server.closeAllConnections();
    server.close();
    fs.rmSync(temp.folder, { recursive: true, force: true });
  });

  it('ends the request of a server that goes silent midway, and keeps no file', async () => {
    const address = server.address();
    const port = typeof address === 'object' ? address?.port : undefined;
    const client = createSubsonicClient(
      { id: '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11', kind: 'subsonic', name: 'Home', url: `http://127.0.0.1:${port}`, username: 'me' },
      'sesame',
      'Tunelle/1.0'
    );
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const pending = downloadSource('silent', client, 'song:1', new AbortController().signal);
    const folder = cacheFolder('source');
    // the bytes that came are in the part file, and the wait for the next ones has begun
    await vi.waitFor(() => expect(fs.readdirSync(folder).map((name) => fs.statSync(path.join(folder, name)).size)).toEqual([18]));

    await vi.advanceTimersByTimeAsync(20_000);

    expect(await pending).toBe(stalled);
    expect(fs.readdirSync(folder)).toEqual([]);
    await vi.waitFor(() => expect(closed).toBe(true));
  });
});
