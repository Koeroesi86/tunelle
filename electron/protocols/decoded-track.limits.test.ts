import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
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

const cache = path.join(path.sep, 'temp', 'tunelle-whole-decodes');
const oldCache = path.join(path.sep, 'temp', 'tunelle-decoded');
const format = { codec: 'WMA', bitDepth: null };
const mib = 1024 ** 2;

let decoded: typeof import('./decoded-track');

/** A source, and a copy of it in the cache of the given size and age (a smaller number is older) */
const copy = async (name: string, size: number | undefined, age: number) => {
  const source = path.join(path.sep, 'music', `${name}.wma`);
  memoryFs.sync.writeFileSync(source, name);
  const prepared = await decoded.prepareDecode(source, format);
  if (!prepared || size === undefined) return prepared?.key;
  const file = `${prepared.key}.wav`;
  memoryFs.sync.writeFileSync(path.join(cache, file), 'x');
  await memoryFs.promises.utimes(path.join(cache, file), new Date(), new Date(age));
  sizes.set(file, size);
  return prepared.key;
};

describe('the cache of the whole decodes', () => {
  beforeEach(async () => {
    memoryFs.reset();
    sizes.clear();
    memoryFs.sync.mkdirSync('/music');
    memoryFs.sync.mkdirSync(cache);
    vi.resetModules();
    decoded = await import('./decoded-track');
  });

  /** The three copies that were served last are spared, so the ones that are tested come before them */
  const serveThreeMore = () => Promise.all(['a', 'b', 'c'].map((name) => copy(`recent-${name}`, undefined, 0)));

  it('removes the oldest copies until the rest fits under the limit', async () => {
    const oldest = await copy('oldest', 1536 * mib, 1000);
    const older = await copy('older', 1536 * mib, 1001);
    const newest = await copy('newest', 400 * mib, 1002);
    await serveThreeMore();

    await decoded.evict();

    expect(memoryFs.sync.readdirSync(cache).sort()).toEqual([`${older}.wav`, `${newest}.wav`].sort());
    expect(memoryFs.sync.existsSync(path.join(cache, `${oldest}.wav`))).toBe(false);
  });

  it('keeps what fits under the limit', async () => {
    await copy('one', cacheLimit / 2, 1000);
    await copy('two', cacheLimit / 2, 1001);
    await serveThreeMore();

    await decoded.evict();

    expect(memoryFs.sync.readdirSync(cache)).toHaveLength(2);
  });

  it('removes the folder of the earlier versions and leaves its own', async () => {
    memoryFs.sync.mkdirSync(oldCache);
    memoryFs.sync.writeFileSync(path.join(oldCache, 'flac-copy.wav'), 'x');

    await decoded.removeOldCache();

    expect(memoryFs.sync.existsSync(oldCache)).toBe(false);
    expect(memoryFs.sync.existsSync(cache)).toBe(true);
  });

  it('does nothing when there is no folder of an earlier version', async () => {
    await expect(decoded.removeOldCache()).resolves.toBeUndefined();
  });
});
