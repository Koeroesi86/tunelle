import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { cacheFolder, makeCacheFolder, removeOldCache } from './cache-folder';

vi.mock('fs/promises', () => ({ ...memoryFs.promises }));
vi.mock('electron', () => ({ app: { getPath: (name: string) => (name === 'home' ? '/home/me' : '/temp') } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

const original = Object.getOwnPropertyDescriptor(process, 'getuid');
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
/** Windows has no `getuid`, which `undefined` stands for */
const asUser = (uid: number | undefined) => Object.defineProperty(process, 'getuid', { configurable: true, value: uid === undefined ? undefined : () => uid });
const asSystem = (platform: NodeJS.Platform) => Object.defineProperty(process, 'platform', { configurable: true, value: platform });

const mine = path.join('/home/me', '.cache', 'tunelle');
const inTemp = path.join('/temp', 'tunelle-1000');
const put = async (file: string, writtenAt: number) => {
  memoryFs.sync.writeFileSync(file, 'x');
  await memoryFs.promises.utimes(file, new Date(writtenAt), new Date(writtenAt));
};

describe('the folders of the caches', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/temp');
    asUser(1000);
    asSystem('linux');
    vi.stubEnv('XDG_CACHE_HOME', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    if (original) Object.defineProperty(process, 'getuid', original);
    else Reflect.deleteProperty(process, 'getuid');
  });

  it.each([
    ['linux', '', 1000, mine],
    ['linux', path.resolve('/xdg'), 1000, path.join(path.resolve('/xdg'), 'tunelle')],
    ['linux', 'relative', 1000, mine],
    ['darwin', path.resolve('/xdg'), 1000, inTemp],
    ['win32', '', undefined, path.join('/temp', 'tunelle-user')],
  ] as const)('are on %s with XDG_CACHE_HOME "%s" and the user %s in %s', async (platform, xdg, uid, folder) => {
    asSystem(platform);
    asUser(uid);
    vi.stubEnv('XDG_CACHE_HOME', xdg);

    expect(await makeCacheFolder('whole-decodes')).toBe(path.join(folder, 'whole-decodes'));
    expect(cacheFolder('source')).toBe(path.join(folder, 'source'));
  });

  it('are made so that no other user reads them', async () => {
    const folder = await makeCacheFolder('source');

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
    memoryFs.sync.mkdirSync(path.dirname(mine));
    await memoryFs.promises.symlink(path.join('/temp', 'elsewhere'), mine);

    await expect(makeCacheFolder('source')).rejects.toThrow('is not a folder of this user');
  });

  it.each([
    ['linux', ['tunelle-decoded', 'tunelle-whole-decodes', 'tunelle-source', 'tunelle-1000']],
    ['darwin', ['tunelle-decoded', 'tunelle-whole-decodes', 'tunelle-source']],
  ] as const)('removes on %s the folders of the earlier versions and leaves its own', async (platform, names) => {
    asSystem(platform);
    const old = names.map((name) => path.join('/temp', name));
    old.forEach((folder) => {
      memoryFs.sync.mkdirSync(folder);
      memoryFs.sync.writeFileSync(path.join(folder, 'copy.wav'), 'x');
    });
    const own = await makeCacheFolder('source');
    memoryFs.sync.writeFileSync(path.join(own, 'kept.src'), 'x');

    await removeOldCache();

    expect(old.filter(memoryFs.sync.existsSync)).toEqual([]);
    expect(memoryFs.sync.existsSync(path.join(own, 'kept.src'))).toBe(true);
  });

  it('removes the half written files of an earlier run, and leaves the ones that are written now', async () => {
    const now = Date.now();
    for (const name of ['whole-decodes', 'source'] as const) {
      const folder = await makeCacheFolder(name);
      await put(path.join(folder, 'old.first.part'), now - 61_000);
      await put(path.join(folder, 'new.second.part'), now);
      await put(path.join(folder, 'copy.wav'), now - 61_000);
    }

    await removeOldCache();

    for (const name of ['whole-decodes', 'source'] as const)
      expect(memoryFs.sync.readdirSync(cacheFolder(name)).sort()).toEqual(['copy.wav', 'new.second.part']);
  });
});
