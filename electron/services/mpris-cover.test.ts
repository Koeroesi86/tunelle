import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coverFolder, createCoverFiles } from './mpris-cover';

describe('coverFolder', () => {
  it('is the folder the Flatpak shares with the host, or one of the app', () => {
    expect(coverFolder('/run/user/1000', 'io.github.koeroesi86.Tunelle')).toBe(join('/run/user/1000', 'app/io.github.koeroesi86.Tunelle'));
    expect(coverFolder('/run/user/1000', undefined)).toBe(join('/run/user/1000', 'tunelle'));
    expect(coverFolder(undefined, undefined)).toBe(join(tmpdir(), 'tunelle-mpris'));
  });
});

describe('createCoverFiles', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tunelle-cover-'));
  });

  afterEach(() => rm(folder, { recursive: true, force: true }));

  it('writes the cover and gives its address', async () => {
    const url = await createCoverFiles(join(folder, 'inner')).write(new Uint8Array([1, 2, 3]), 'image/png');

    expect(url.startsWith('file://')).toBe(true);
    expect(fileURLToPath(url).endsWith('.png')).toBe(true);
    expect([...(await readFile(fileURLToPath(url)))]).toEqual([1, 2, 3]);
  });

  it('keeps one file, under a new name for each cover', async () => {
    const covers = createCoverFiles(folder);
    const first = await covers.write(new Uint8Array([1]), 'image/jpeg');
    const second = await covers.write(new Uint8Array([2]), 'image/jpeg');

    expect(second).not.toBe(first);
    expect(await readdir(folder)).toEqual([fileURLToPath(second).split('/').pop()]);
  });

  it('removes the file on clear, also when there is none', async () => {
    const covers = createCoverFiles(folder);
    await covers.clear();
    await covers.write(new Uint8Array([1]), 'application/x-unknown');
    expect((await readdir(folder))[0].endsWith('.img')).toBe(true);

    await covers.clear();

    expect(await readdir(folder)).toEqual([]);
  });
});
