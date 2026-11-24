import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { fastCacheLimit, slowCacheLimit } from './decode-policy';
import { sourceSpeed } from './source-speed';

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
vi.mock('./source-speed', () => ({ sourceSpeed: vi.fn() }));

const cache = path.join(path.sep, 'temp', 'tunelle-decoded');
const format = { codec: 'FLAC', bitDepth: null };
const mib = 1024 ** 2;

let decoded: typeof import('./decoded-track');

/** A source of the given speed, and a copy of it in the cache of the given size and age (a smaller number is older) */
const copy = async (name: string, speed: 'fast' | 'slow', size: number | undefined, age: number) => {
  const source = path.join(path.sep, 'music', `${name}.flac`);
  memoryFs.sync.writeFileSync(source, name);
  vi.mocked(sourceSpeed).mockResolvedValueOnce(speed);
  const prepared = await decoded.prepareDecode(source, format);
  if (!prepared || size === undefined) return prepared?.key;
  const file = `${prepared.key}.wav`;
  memoryFs.sync.writeFileSync(path.join(cache, file), 'x');
  await memoryFs.promises.utimes(path.join(cache, file), new Date(), new Date(age));
  sizes.set(file, size);
  return prepared.key;
};

describe('evict by the speed of the source', () => {
  beforeEach(async () => {
    memoryFs.reset();
    sizes.clear();
    memoryFs.sync.mkdirSync('/music');
    memoryFs.sync.mkdirSync(cache);
    vi.resetModules();
    decoded = await import('./decoded-track');
  });

  /** The three copies that were served last are spared, so the ones that are tested come before them */
  const serveThreeMore = () => Promise.all(['a', 'b', 'c'].map((name) => copy(`recent-${name}`, 'slow', undefined, 0)));

  it('removes the oldest copies of a fast source above its low limit, and leaves the copies of a slow source under the high one', async () => {
    const slow = await copy('slow', 'slow', 1536 * mib, 1000);
    const fastOld = await copy('fast-old', 'fast', 200 * mib, 1001);
    const fastNew = await copy('fast-new', 'fast', 200 * mib, 1002);
    await serveThreeMore();

    await decoded.evict();

    expect(memoryFs.sync.readdirSync(cache).sort()).toEqual([`${fastNew}.wav`, `${slow}.wav`].sort());
    expect(memoryFs.sync.existsSync(path.join(cache, `${fastOld}.wav`))).toBe(false);
  });

  it('removes the oldest copies of a slow source only above the high limit', async () => {
    const old = await copy('slow-old', 'slow', 1536 * mib, 1000);
    const kept = await copy('slow-new', 'slow', 1536 * mib, 1001);
    await serveThreeMore();

    await decoded.evict();

    expect(memoryFs.sync.readdirSync(cache)).toEqual([`${kept}.wav`]);
    expect(memoryFs.sync.existsSync(path.join(cache, `${old}.wav`))).toBe(false);
  });

  it('keeps what fits under the low limit', async () => {
    await copy('fast', 'fast', fastCacheLimit - mib, 1000);
    await copy('slow', 'slow', slowCacheLimit - mib, 1001);
    await serveThreeMore();

    await decoded.evict();

    expect(memoryFs.sync.readdirSync(cache)).toHaveLength(2);
  });
});
