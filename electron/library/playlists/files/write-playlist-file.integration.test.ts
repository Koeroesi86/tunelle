// Needs the real files: the backup, the temporary file and a read only folder as the system treats them
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { retirePlaylistFile, writePlaylistFile } from './write-playlist-file';

describe('writing a playlist file', () => {
  let folder: string;
  let file: string;
  const names = () => fs.promises.readdir(folder).then((found) => found.sort());
  const read = (name: string) => fs.promises.readFile(path.join(folder, name), 'utf-8');

  beforeEach(async () => {
    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tunelle-write-'));
    file = path.join(folder, 'mix.m3u');
  });

  afterEach(async () => {
    await fs.promises.chmod(folder, 0o755).catch(() => undefined);
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  it('creates a file that was not there, with no backup and no temporary file left, and returns its modification time', async () => {
    const modified = await writePlaylistFile(file, Buffer.from('new\n'), true);

    expect(await names()).toEqual(['mix.m3u']);
    expect(await read('mix.m3u')).toBe('new\n');
    expect(modified).toBe(Math.floor((await fs.promises.stat(file)).mtimeMs));
  });

  it('keeps the first file as .bak and never writes over an earlier .bak', async () => {
    await fs.promises.writeFile(file, 'original\n');

    await writePlaylistFile(file, Buffer.from('first\n'), true);
    await writePlaylistFile(file, Buffer.from('second\n'), true);

    expect(await names()).toEqual(['mix.m3u', 'mix.m3u.bak']);
    expect(await read('mix.m3u')).toBe('second\n');
    expect(await read('mix.m3u.bak')).toBe('original\n');
  });

  it('makes no .bak when none is asked for', async () => {
    await fs.promises.writeFile(file, 'original\n');

    await writePlaylistFile(file, Buffer.from('copy\n'), false);

    expect(await names()).toEqual(['mix.m3u']);
  });

  it('fails when the folder is not there, and leaves nothing', async () => {
    await expect(writePlaylistFile(path.join(folder, 'missing', 'mix.m3u'), Buffer.from('x'), true)).rejects.toMatchObject({ code: 'ENOENT' });

    expect(await names()).toEqual([]);
  });

  it('fails when a folder has the name of the file, keeps it, and leaves no temporary file', async () => {
    await fs.promises.mkdir(file);
    await fs.promises.writeFile(path.join(file, 'inside.txt'), 'kept');

    await expect(writePlaylistFile(file, Buffer.from('x'), false)).rejects.toThrow();

    expect(await names()).toEqual(['mix.m3u']);
    expect(await fs.promises.readdir(file)).toEqual(['inside.txt']);
  });

  // a folder that is made read only holds nothing back from a process of the super user, and Windows takes no mode of a folder
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails in a read only folder, keeps the old file as it was, and leaves no temporary file',
    async () => {
      await fs.promises.writeFile(file, 'original\n');
      await fs.promises.chmod(folder, 0o555);

      await expect(writePlaylistFile(file, Buffer.from('new\n'), true)).rejects.toMatchObject({ code: expect.stringMatching(/^(EACCES|EPERM)$/) });

      await fs.promises.chmod(folder, 0o755);
      expect(await names()).toEqual(['mix.m3u']);
      expect(await read('mix.m3u')).toBe('original\n');
    }
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'replaces a read only file in a folder that can be written to, as the file is replaced and not written into',
    async () => {
      await fs.promises.writeFile(file, 'original\n');
      await fs.promises.chmod(file, 0o444);

      await writePlaylistFile(file, Buffer.from('new\n'), true);

      expect(await read('mix.m3u')).toBe('new\n');
      expect(await read('mix.m3u.bak')).toBe('original\n');
    }
  );
});

describe('retiring a playlist file', () => {
  let folder: string;
  let file: string;

  beforeEach(async () => {
    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tunelle-retire-'));
    file = path.join(folder, 'mix.m3u');
  });

  afterEach(() => fs.promises.rm(folder, { recursive: true, force: true }));

  it('keeps the file as .bak and takes it away', async () => {
    await fs.promises.writeFile(file, 'original\n');

    await retirePlaylistFile(file);

    expect(await fs.promises.readdir(folder)).toEqual(['mix.m3u.bak']);
  });

  it('does not write over a .bak that is there', async () => {
    await fs.promises.writeFile(file, 'newer\n');
    await fs.promises.writeFile(`${file}.bak`, 'older\n');

    await retirePlaylistFile(file);

    expect(await fs.promises.readFile(`${file}.bak`, 'utf-8')).toBe('older\n');
    await expect(fs.promises.access(file)).rejects.toThrow();
  });

  it('is done when the file is already gone', async () => {
    await expect(retirePlaylistFile(file)).resolves.toBeUndefined();
  });
});
