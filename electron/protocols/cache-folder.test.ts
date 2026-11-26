import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { cacheFolder, makeCacheFolder, removeOldCache } from './cache-folder';

vi.mock('fs/promises', () => ({ ...memoryFs.promises }));
vi.mock('electron', () => ({ app: { getPath: () => '/temp' } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

const original = Object.getOwnPropertyDescriptor(process, 'getuid');
/** Windows has no `getuid`, which `undefined` stands for */
const asUser = (uid: number | undefined) => Object.defineProperty(process, 'getuid', { configurable: true, value: uid === undefined ? undefined : () => uid });

const mine = path.join('/temp', 'tunelle-1000');

describe('the folders of the caches', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/temp');
    asUser(1000);
  });
  afterEach(() => {
    if (original) Object.defineProperty(process, 'getuid', original);
    else Reflect.deleteProperty(process, 'getuid');
  });

  it('makes a folder for each user that no other one reads', async () => {
    const folder = await makeCacheFolder('source');

    expect(folder).toBe(path.join(mine, 'source'));
    expect(cacheFolder('whole-decodes')).toBe(path.join(mine, 'whole-decodes'));
    expect((await memoryFs.promises.lstat(mine)).mode).toBe(0o700);
    expect((await memoryFs.promises.lstat(folder)).mode).toBe(0o700);
  });

  it('closes a folder of its own that others could read', async () => {
    await memoryFs.promises.mkdir(mine, { mode: 0o755 });

    await makeCacheFolder('source');

    expect((await memoryFs.promises.lstat(mine)).mode).toBe(0o700);
  });

  it('refuses a folder that another user made', async () => {
    asUser(2000);
    await memoryFs.promises.mkdir(mine);
    asUser(1000);

    await expect(makeCacheFolder('source')).rejects.toThrow('is not a folder of this user');
    expect(memoryFs.sync.existsSync(path.join(mine, 'source'))).toBe(false);
  });

  it('refuses a link in the place of the folder', async () => {
    await memoryFs.promises.symlink(path.join('/temp', 'elsewhere'), mine);

    await expect(makeCacheFolder('source')).rejects.toThrow('is not a folder of this user');
  });

  it('checks no owner where there are no user ids', async () => {
    asUser(undefined);

    expect(await makeCacheFolder('whole-decodes')).toBe(path.join('/temp', 'tunelle-user', 'whole-decodes'));
  });

  it('removes the folders of the earlier versions and leaves its own', async () => {
    const old = ['tunelle-decoded', 'tunelle-whole-decodes', 'tunelle-source'].map((name) => path.join('/temp', name));
    old.forEach((folder) => {
      memoryFs.sync.mkdirSync(folder);
      memoryFs.sync.writeFileSync(path.join(folder, 'copy.wav'), 'x');
    });
    await makeCacheFolder('source');

    await removeOldCache();

    expect(old.filter(memoryFs.sync.existsSync)).toEqual([]);
    expect(memoryFs.sync.existsSync(cacheFolder('source'))).toBe(true);
  });

  it('does nothing when there is no folder of an earlier version', async () => {
    await expect(removeOldCache()).resolves.toBeDefined();
  });
});
