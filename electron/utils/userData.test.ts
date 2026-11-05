import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyOldLibrary, copyOldUserData, getAppName } from './userData';

describe('getAppName', () => {
  it('is the product name, and a development run has a name of its own', () => {
    expect([getAppName(false), getAppName(true)]).toEqual(['Tunelle', 'Tunelle-dev']);
  });
});

describe('copyOldLibrary', () => {
  let root: string;
  let oldFolder: string;
  let newFolder: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tunelle-library-'));
    oldFolder = join(root, 'electron-music-player');
    newFolder = join(root, 'tunelle');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('copies the library with its covers and backups, and keeps the old folder', () => {
    mkdirSync(join(oldFolder, 'covers'), { recursive: true });
    writeFileSync(join(oldFolder, 'library.sqlite'), 'songs');
    writeFileSync(join(oldFolder, 'library.sqlite.v3.bak'), 'older songs');
    writeFileSync(join(oldFolder, 'covers', 'a.jpg'), 'cover');

    expect(copyOldLibrary(oldFolder, newFolder)).toBe(true);
    expect(['library.sqlite', 'library.sqlite.v3.bak', 'covers/a.jpg'].map((name) => readFileSync(join(newFolder, name), 'utf8'))).toEqual([
      'songs',
      'older songs',
      'cover',
    ]);
    expect(existsSync(join(oldFolder, 'library.sqlite'))).toBe(true);
  });

  it('copies into the folder that Electron data created, which is the same folder on macOS and Windows', () => {
    mkdirSync(oldFolder);
    writeFileSync(join(oldFolder, 'library.sqlite'), 'songs');
    mkdirSync(newFolder);
    writeFileSync(join(newFolder, 'window-state.json'), 'kept');

    expect(copyOldLibrary(oldFolder, newFolder)).toBe(true);
    expect([readFileSync(join(newFolder, 'library.sqlite'), 'utf8'), readFileSync(join(newFolder, 'window-state.json'), 'utf8')]).toEqual(['songs', 'kept']);
  });

  it('does not touch a library that is already there', () => {
    mkdirSync(oldFolder);
    writeFileSync(join(oldFolder, 'library.sqlite'), 'old');
    mkdirSync(newFolder);
    writeFileSync(join(newFolder, 'library.sqlite'), 'new');

    expect(copyOldLibrary(oldFolder, newFolder)).toBe(false);
    expect(readFileSync(join(newFolder, 'library.sqlite'), 'utf8')).toBe('new');
  });

  it('does nothing on a first run', () => {
    expect(copyOldLibrary(oldFolder, newFolder)).toBe(false);
    expect(existsSync(newFolder)).toBe(false);
  });

  it('ignores a copy that fails, so the app starts as on a first run', () => {
    mkdirSync(oldFolder);
    writeFileSync(join(oldFolder, 'library.sqlite'), 'songs');
    writeFileSync(join(root, 'parent'), 'a file where the parent folder should be');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(copyOldLibrary(oldFolder, join(root, 'parent', 'tunelle'))).toBe(false);
    expect(logged).toHaveBeenCalled();
  });
});

describe('copyOldUserData', () => {
  let root: string;
  let oldFolder: string;
  let newFolder: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tunelle-user-data-'));
    oldFolder = join(root, 'eMusic');
    newFolder = join(root, 'Tunelle');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('copies the data of the old folder, and keeps the old folder', () => {
    mkdirSync(join(oldFolder, 'Local Storage'), { recursive: true });
    writeFileSync(join(oldFolder, 'window-state.json'), '{"width":900}');
    writeFileSync(join(oldFolder, 'Local Storage', 'leveldb'), 'volume');

    expect(copyOldUserData(oldFolder, newFolder)).toBe(true);
    expect(readFileSync(join(newFolder, 'window-state.json'), 'utf8')).toBe('{"width":900}');
    expect(readFileSync(join(newFolder, 'Local Storage', 'leveldb'), 'utf8')).toBe('volume');
    expect(existsSync(join(oldFolder, 'window-state.json'))).toBe(true);
  });

  it('leaves the locks and the caches of the old folder', () => {
    mkdirSync(join(oldFolder, 'Cache'), { recursive: true });
    writeFileSync(join(oldFolder, 'Cache', 'entry'), 'x');
    symlinkSync('host-1234', join(oldFolder, 'SingletonLock'));
    writeFileSync(join(oldFolder, 'keep'), 'y');

    copyOldUserData(oldFolder, newFolder);

    expect(['keep', 'Cache', 'SingletonLock'].map((name) => existsSync(join(newFolder, name)))).toEqual([true, false, false]);
  });

  it('does not touch a folder that already exists', () => {
    mkdirSync(oldFolder);
    writeFileSync(join(oldFolder, 'window-state.json'), 'old');
    mkdirSync(newFolder);
    writeFileSync(join(newFolder, 'window-state.json'), 'new');

    expect(copyOldUserData(oldFolder, newFolder)).toBe(false);
    expect(readFileSync(join(newFolder, 'window-state.json'), 'utf8')).toBe('new');
  });

  it('does nothing on a first run', () => {
    expect(copyOldUserData(oldFolder, newFolder)).toBe(false);
    expect(existsSync(newFolder)).toBe(false);
  });

  it('ignores a copy that fails, so the app starts as on a first run', () => {
    mkdirSync(oldFolder);
    writeFileSync(oldFolder + '/file', 'x');
    writeFileSync(newFolder + '-parent', 'a file where the parent folder should be');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(copyOldUserData(oldFolder, join(newFolder + '-parent', 'Tunelle'))).toBe(false);
    expect(logged).toHaveBeenCalled();
  });
});
