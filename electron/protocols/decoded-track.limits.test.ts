import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { cacheFolder } from './cache-folder';
import { cacheLimit } from './decode-policy';

const sizes = vi.hoisted(() => new Map<string, number>());

vi.mock('fs/promises', async () => ({
  ...memoryFs.promises,
  stat: async (file: string) => {
    const stats = await memoryFs.promises.stat(file);
    return { ...stats, size: sizes.get(path.basename(file)) ?? stats.size };
  },
}));
vi.mock('electron', () => ({ app: { getPath: () => '/temp', getAppPath: () => '/app/dist', isPackaged: false } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

const cache = cacheFolder('whole-decodes');
const format = { codec: 'WMA', bitDepth: null };
const mib = 1024 ** 2;
const large = 1536 * mib;

let decoded: typeof import('./decoded-track');
let held: typeof import('./held-files');

const age = (file: string, time: number) => memoryFs.promises.utimes(path.join(cache, file), new Date(), new Date(time));

const put = async (file: string, size: number, time: number) => {
  memoryFs.sync.writeFileSync(path.join(cache, file), 'x');
  await age(file, time);
  sizes.set(file, size);
};

/** A source, and a copy of it in the cache of the given size and age (a smaller number is older) */
const copy = async (name: string, size: number, time: number) => {
  const source = path.join(path.sep, 'music', `${name}.wma`);
  memoryFs.sync.writeFileSync(source, name);
  const prepared = await decoded.prepareDecode(source, format);
  const file = `${prepared?.key}.wav`;
  await put(file, size, time);
  /** Asks for the copy as a request does, and puts its age back, which a served copy loses */
  const serve = async (measured = false) => {
    await decoded.decodeTrack(source, format, new AbortController().signal, measured);
    await age(file, time);
  };
  return { source, file, serve };
};

const cached = () => memoryFs.sync.readdirSync(cache).sort();

describe('the cache of the whole decodes', () => {
  beforeEach(async () => {
    memoryFs.reset();
    sizes.clear();
    memoryFs.sync.mkdirSync('/music');
    memoryFs.sync.mkdirSync(cache);
    vi.resetModules();
    decoded = await import('./decoded-track');
    held = await import('./held-files');
  });

  it('removes the oldest copies until the rest fits under the limit', async () => {
    await copy('oldest', large, 1000);
    const older = await copy('older', large, 1001);
    const newest = await copy('newest', 400 * mib, 1002);

    await decoded.evict();

    expect(cached()).toEqual([older.file, newest.file].sort());
  });

  it('keeps what fits under the limit', async () => {
    await copy('one', cacheLimit / 2, 1000);
    await copy('two', cacheLimit / 2, 1001);

    await decoded.evict();

    expect(cached()).toHaveLength(2);
  });

  it('spares every part file of a key in use, and removes the ones that nothing writes', async () => {
    const playing = await copy('playing', 1, 1000);
    await playing.serve();
    const part = playing.file.replace('.wav', '.wav.first.part');
    await put(part, large, 1001);
    await put('abandoned.wav.second.part', large, 1002);

    await decoded.evict();

    expect(cached()).toEqual([playing.file, part].sort());
  });

  it('spares the copies that the player asked for last, whatever the measurement and the windows ask for', async () => {
    const played = await copy('played', large, 1000);
    await played.serve();
    const others = await Promise.all(['a', 'b', 'c'].map((name, index) => copy(name, large, 1001 + index)));
    for (const other of others) await other.serve(true);
    for (const other of others) await decoded.prepareDecode(other.source, format);

    await decoded.evict();

    expect(cached()).toEqual([played.file]);
  });

  it('spares a copy that is being read', async () => {
    const read = await copy('read', large, 1000);
    await copy('idle', large, 1001);
    const release = held.holdFile(path.join(cache, read.file));

    await decoded.evict();
    expect(cached()).toEqual([read.file]);

    release();
    await copy('newer', large, 1002);
    await decoded.evict();
    expect(cached()).not.toContain(read.file);
  });
});
