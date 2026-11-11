import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cpSync, existsSync } = vi.hoisted(() => ({ cpSync: vi.fn(), existsSync: vi.fn() }));

vi.mock('fs', () => ({ cpSync, existsSync, default: { cpSync, existsSync } }));

const { copyOldLibrary, copyOldUserData, getAppName } = await import('./user-data');

// the folders that exist, by path
const exist = (...paths: string[]) => existsSync.mockImplementation((path: string) => paths.includes(path));

const copyFilter = () => cpSync.mock.calls[0][2].filter as (source: string) => boolean;

describe('getAppName', () => {
  it('is the product name, and a development run has a name of its own', () => {
    expect([getAppName(false), getAppName(true)]).toEqual(['Tunelle', 'Tunelle-dev']);
  });
});

describe.each([
  ['copyOldLibrary', copyOldLibrary, '/data/electron-music-player', '/data/tunelle', join('/data/tunelle', 'library.sqlite')],
  ['copyOldUserData', copyOldUserData, '/data/eMusic', '/data/Tunelle', '/data/Tunelle'],
])('%s', (_name, copy, oldFolder, newFolder, marker) => {
  beforeEach(() => {
    cpSync.mockReset();
    exist();
  });

  it('copies the old folder without overwriting, and keeps the old folder', () => {
    exist(oldFolder);

    expect(copy(oldFolder, newFolder)).toBe(true);
    expect(cpSync).toHaveBeenCalledWith(oldFolder, newFolder, expect.objectContaining({ recursive: true, force: false }));
  });

  it('does not touch what is already there', () => {
    exist(oldFolder, marker);

    expect(copy(oldFolder, newFolder)).toBe(false);
    expect(cpSync).not.toHaveBeenCalled();
  });

  it('does nothing on a first run', () => {
    expect(copy(oldFolder, newFolder)).toBe(false);
    expect(cpSync).not.toHaveBeenCalled();
  });

  it('ignores a copy that fails, so the app starts as on a first run', () => {
    exist(oldFolder);
    cpSync.mockImplementation(() => {
      throw new Error('ENOTDIR');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(copy(oldFolder, newFolder)).toBe(false);
    expect(logged).toHaveBeenCalled();
  });

  it('leaves the locks and the caches of the old folder', () => {
    exist(oldFolder);
    copy(oldFolder, newFolder);

    const filter = copyFilter();
    expect(['keep', 'Cache', 'SingletonLock', 'Code Cache'].map((name) => filter(`${oldFolder}/${name}`))).toEqual([true, false, false, false]);
  });
});

describe('copyOldLibrary into the folder that Electron data created', () => {
  it('copies when only the library is missing, which is the same folder on macOS and Windows', () => {
    exist('/data/electron-music-player', '/data/tunelle');

    expect(copyOldLibrary('/data/electron-music-player', '/data/tunelle')).toBe(true);
  });
});
