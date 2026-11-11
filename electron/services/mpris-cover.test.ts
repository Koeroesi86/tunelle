import { basename, join } from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { coverFolder, createCoverFiles } from './mpris-cover';

vi.mock('fs/promises', () => ({ ...memoryFs.promises, default: memoryFs.promises }));

const { readdir, readFile } = memoryFs.promises;

describe('coverFolder', () => {
  it('is the folder the Flatpak shares with the host, or one of the app, and none without the runtime folder of the user', () => {
    expect(coverFolder('/run/user/1000', 'io.github.koeroesi86.Tunelle')).toBe(join('/run/user/1000', 'app/io.github.koeroesi86.Tunelle'));
    expect(coverFolder('/run/user/1000', undefined)).toBe(join('/run/user/1000', 'tunelle'));
    expect(coverFolder(undefined, undefined)).toBeUndefined();
  });
});

describe('createCoverFiles', () => {
  const folder = '/run/user/1000/tunelle';

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(folder);
  });

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
    expect(await readdir(folder)).toEqual([basename(fileURLToPath(second))]);
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
