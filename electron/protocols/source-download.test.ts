import path from 'path';
import { Writable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { logError } from '../utils/log-error';
import { downloadSource } from './source-download';

vi.mock('fs/promises', () => ({ ...memoryFs.promises }));
vi.mock('fs', () => ({
  createWriteStream: (file: string) => {
    memoryFs.sync.writeFileSync(file, '');
    return new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        memoryFs.sync.appendFileSync(file, chunk);
        done();
      },
    });
  },
}));
vi.mock('electron', () => ({ app: { getPath: () => '/temp' } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

const folder = path.join('/temp', 'tunelle-source');
const files = () => (memoryFs.sync.existsSync(folder) ? memoryFs.sync.readdirSync(folder) : []);

/** A server whose answers end only when the test ends them, also after the request was aborted */
const server = () => {
  const bodies: ReadableStreamDefaultController<Uint8Array>[] = [];
  const stream = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start: (controller) => void bodies.push(controller) })));
  return { bodies, stream, client: { stream } as unknown as Parameters<typeof downloadSource>[1] };
};

const send = (body: ReadableStreamDefaultController<Uint8Array>, content: string) => {
  body.enqueue(Buffer.from(content));
  body.close();
};

describe('downloadSource', () => {
  let key = '';
  let count = 0;
  const signal = () => new AbortController().signal;
  const writing = (parts: number) => vi.waitFor(() => expect(files().filter((name) => name.endsWith('.part'))).toHaveLength(parts));

  beforeEach(() => {
    memoryFs.reset();
    vi.mocked(logError).mockClear();
    count += 1;
    key = `server:track-${count}`;
  });

  it('downloads once for the requests that ask meanwhile, and goes on while one of them waits', async () => {
    const { bodies, stream, client } = server();
    const gone = new AbortController();
    const first = downloadSource(key, client, 'song:1', gone.signal);
    const second = downloadSource(key, client, 'song:1', signal());
    await writing(1);

    gone.abort();
    send(bodies[0], 'track');

    const file = await second;
    expect(await first).toBe(file);
    expect(memoryFs.sync.readFileSync(file ?? '', 'utf8')).toBe('track');
    expect(files()).toEqual([path.basename(file ?? '')]);
    expect(stream).toHaveBeenCalledOnce();
  });

  it('starts anew for a request that follows a cancelled one, which can not touch the new download when it ends', async () => {
    const { bodies, stream, client } = server();
    const controller = new AbortController();
    const cancelled = downloadSource(key, client, 'song:1', controller.signal);
    await writing(1);

    controller.abort();
    const retry = downloadSource(key, client, 'song:1', signal());
    await writing(2);
    bodies[0].error(new Error('aborted'));
    expect(await cancelled).toBeUndefined();
    const joined = downloadSource(key, client, 'song:1', signal());
    // the third request has to reach the map before the download ends
    await new Promise((resolve) => setImmediate(resolve));
    send(bodies[1], 'whole');

    const file = await retry;
    expect(await joined).toBe(file);
    expect(memoryFs.sync.readFileSync(file ?? '', 'utf8')).toBe('whole');
    expect(files()).toEqual([path.basename(file ?? '')]);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(logError).not.toHaveBeenCalled();
  });

  it('keeps no file of a cancelled download, even when the server sends all of it', async () => {
    const { bodies, client } = server();
    const controller = new AbortController();
    const cancelled = downloadSource(key, client, 'song:1', controller.signal);
    await writing(1);

    controller.abort();
    send(bodies[0], 'track');

    expect(await cancelled).toBeUndefined();
    expect(files()).toEqual([]);
  });

  it('removes the part files that no download writes, and leaves the ones of the running downloads', async () => {
    const { bodies, client } = server();
    memoryFs.sync.mkdirSync(folder);
    memoryFs.sync.writeFileSync(path.join(folder, 'abandoned.src.old.part'), 'x');
    const running = downloadSource(`${key}-slow`, client, 'song:1', signal());
    await writing(2);
    const done = downloadSource(key, client, 'song:2', signal());
    await writing(3);

    send(bodies[1], 'track');
    const file = await done;

    expect(files()).toHaveLength(2);
    expect(files()).toContain(path.basename(file ?? ''));
    expect(files()).not.toContain('abandoned.src.old.part');
    send(bodies[0], 'slow');
    expect(await running).toBeDefined();
  });
});
