import type { IncomingMessage } from 'node:http';
import path from 'path';
import { Readable, Writable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { createJellyfinClient } from '../services/sources/jellyfin-client';
import { createPlexClient } from '../services/sources/plex-client';
import { openSource } from '../services/sources/source-request';
import { logError } from '../utils/log-error';
import { cacheFolder } from './cache-folder';
import { holdFile } from './held-files';
import { downloadSource, stalled } from './source-download';

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
vi.mock('../services/sources/source-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/sources/source-request')>()),
  openSource: vi.fn(),
}));

const folder = cacheFolder('source');
const files = () => (memoryFs.sync.existsSync(folder) ? memoryFs.sync.readdirSync(folder) : []);
/** The path of a download that gave a file, empty for one that did not */
const pathOf = (found: Awaited<ReturnType<typeof downloadSource>>) => (typeof found === 'string' ? found : '');

/** A server whose answers end only when the test ends them, also after the request was aborted */
const server = () => {
  const bodies: ReadableStreamDefaultController<Uint8Array>[] = [];
  const stream = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start: (controller) => void bodies.push(controller) })));
  return { bodies, stream, client: { stream } as unknown as Parameters<typeof downloadSource>[1] };
};

/** A server as a real one is: the body of its answer fails when the request is aborted */
const abortable = () => {
  const bodies: ReadableStreamDefaultController<Uint8Array>[] = [];
  const stream = vi.fn(async (_id: string, _range: undefined, aborting: AbortSignal) => {
    const start = (controller: ReadableStreamDefaultController<Uint8Array>) => {
      bodies.push(controller);
      aborting.addEventListener('abort', () => controller.error(new Error('aborted')));
    };
    return new Response(new ReadableStream<Uint8Array>({ start }));
  });
  return { bodies, stream, client: { stream } as unknown as Parameters<typeof downloadSource>[1] };
};

const page = () =>
  Object.assign(Readable.from([Buffer.from('<html>Sign in</html>')]), {
    statusCode: 200,
    headers: { 'content-type': 'text/html' },
  }) as unknown as IncomingMessage;
const song = { ratingKey: '77', title: 'Song', Media: [{ Part: [{ key: '/library/parts/9/1/file.flac' }] }] };
const json = (body: object) =>
  Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
  }) as unknown as IncomingMessage;
const mediaServer = { id: '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11', name: 'Den', url: 'https://media.example.com', username: 'me' };

/** Each client, with what its server answers to one request for the stream of a track */
const clients = [
  {
    name: 'Jellyfin',
    create: () => createJellyfinClient({ ...mediaServer, kind: 'jellyfin' }, 'sesame', 'Tunelle/1.0'),
    first: () => [json({ AccessToken: 'token', User: { Id: 'u1' } }), page()],
  },
  {
    name: 'Plex',
    create: () => createPlexClient({ ...mediaServer, kind: 'plex' }, 'token', 'Tunelle/1.0'),
    first: () => [json({ MediaContainer: { Metadata: [song] } }), page()],
  },
];

const send = (body: ReadableStreamDefaultController<Uint8Array>, content: string) => {
  body.enqueue(Buffer.from(content));
  body.close();
};

describe('downloadSource', () => {
  let key = '';
  let count = 0;
  const signal = () => new AbortController().signal;
  const writing = (parts: number) => vi.waitFor(() => expect(files().filter((name) => name.endsWith('.part'))).toHaveLength(parts));

  /** A download that the server answers at once, each at a later time than the one before */
  const downloaded = async ({ bodies, client }: ReturnType<typeof server>, name: string) => {
    const asked = bodies.length;
    vi.setSystemTime(Date.now() + 1000);
    const pending = downloadSource(`${key}-${name}`, client, name, signal());
    await vi.waitFor(() => expect(bodies).toHaveLength(asked + 1));
    send(bodies[asked], name);
    return pathOf(await pending);
  };
  const contents = () => files().map((name) => memoryFs.sync.readFileSync(path.join(folder, name), 'utf8'));

  afterEach(() => vi.useRealTimers());

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

    const file = pathOf(await second);
    expect(await first).toBe(file);
    expect(memoryFs.sync.readFileSync(file, 'utf8')).toBe('track');
    expect(files()).toEqual([path.basename(file)]);
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

    const file = pathOf(await retry);
    expect(await joined).toBe(file);
    expect(memoryFs.sync.readFileSync(file, 'utf8')).toBe('whole');
    expect(files()).toEqual([path.basename(file)]);
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

  it('keeps the three files that were asked for last, and leaves their times', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const answers = server();
    const first = await downloaded(answers, 'first');
    const { mtimeMs } = memoryFs.sync.statSync(first);
    await downloaded(answers, 'second');
    await downloaded(answers, 'third');
    vi.setSystemTime(Date.now() + 1000);

    expect(await downloadSource(`${key}-first`, answers.client, 'first', signal())).toBe(first);
    await downloaded(answers, 'fourth');

    expect(contents().sort()).toEqual(['first', 'fourth', 'third']);
    expect(memoryFs.sync.statSync(first).mtimeMs).toBe(mtimeMs);
    expect(answers.stream).toHaveBeenCalledTimes(4);
  });

  it('spares a file that is being read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const answers = server();
    const release = holdFile(await downloaded(answers, 'first'));
    for (const name of ['second', 'third', 'fourth']) await downloaded(answers, name);
    expect(contents()).toContain('first');

    release();
    await downloaded(answers, 'fifth');

    expect(contents()).not.toContain('first');
  });

  it('gives nothing, and asks the server for nothing, when its folder can not be made', async () => {
    // a file where the folder of the user goes
    memoryFs.sync.mkdirSync('/temp');
    memoryFs.sync.writeFileSync(path.dirname(folder), 'x');
    const { stream, client } = server();

    expect(await downloadSource(key, client, 'song:1', signal())).toBeUndefined();
    expect(stream).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
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
    const file = pathOf(await done);

    expect(files()).toHaveLength(2);
    expect(files()).toContain(path.basename(file));
    expect(files()).not.toContain('abandoned.src.old.part');
    send(bodies[0], 'slow');
    expect(await running).toBeDefined();
  });

  it('ends a download of a server that goes silent midway, and keeps no file', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { bodies, stream, client } = abortable();
    const pending = downloadSource(key, client, 'song:1', signal());
    await writing(1);
    bodies[0].enqueue(Buffer.from('half'));
    await vi.waitFor(() => expect(contents()).toEqual(['half']));

    await vi.advanceTimersByTimeAsync(20_000);

    expect(await pending).toBe(stalled);
    expect(files()).toEqual([]);
    expect(stream.mock.calls[0][2].aborted).toBe(true);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The server stopped sending song:1' }));
  });

  it('does not cut a slow download that keeps sending', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { bodies, client } = abortable();
    const pending = downloadSource(key, client, 'song:1', signal());
    await writing(1);

    for (const [index, chunk] of ['a', 'b', 'c'].entries()) {
      await vi.advanceTimersByTimeAsync(19_000);
      bodies[0].enqueue(Buffer.from(chunk));
      await vi.waitFor(() => expect(contents()).toEqual(['abc'.slice(0, index + 1)]));
    }
    bodies[0].close();

    expect(await pending).toBeTypeOf('string');
    expect(contents()).toEqual(['abc']);
  });

  it.each(clients)('keeps no file when a $name server answers with a page and the status 200, and asks again', async ({ create, first }) => {
    const client = create();
    first().forEach((response) => vi.mocked(openSource).mockResolvedValueOnce(response));
    expect(await downloadSource(key, client, '77', signal())).toBeUndefined();
    expect(files()).toEqual([]);

    // the login and the path of the song are kept by the client, so only the file is asked for
    vi.mocked(openSource).mockClear().mockResolvedValueOnce(page());
    expect(await downloadSource(key, client, '77', signal())).toBeUndefined();

    expect(openSource).toHaveBeenCalledOnce();
    expect(files()).toEqual([]);
  });
});
