import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseFile } from 'music-metadata';
import { readTrackFile } from './readTrackFile';

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

const withPicture = (data: string) => ({
  common: { album: 'Album', picture: [{ format: 'image/jpeg', data: Buffer.from(data) }] },
  format: { duration: 60 },
  native: {},
});

describe('readTrackFile pictures', () => {
  let root: string;
  const folder = () => path.join(root, 'albumart');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-reader-art-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes the picture into the album art folder and names it', async () => {
    vi.mocked(parseFile).mockResolvedValue(withPicture('cover') as never);

    const track = await readTrackFile('/music/a.flac', root);

    expect(fs.readdirSync(folder())).toEqual([track.picture]);
    expect(track.picture).toMatch(/^album-[0-9a-f]{32}\.jpg$/);
  });

  it('makes the folder once for the pictures of a process', async () => {
    const mkdir = vi.spyOn(fs, 'mkdirSync');
    vi.mocked(parseFile)
      .mockResolvedValueOnce(withPicture('one') as never)
      .mockResolvedValueOnce(withPicture('two') as never);

    await readTrackFile('/music/a.flac', root);
    await readTrackFile('/music/b.flac', root);

    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(folder())).toHaveLength(2);
  });

  it('makes the folder again when it was removed meanwhile', async () => {
    vi.mocked(parseFile)
      .mockResolvedValueOnce(withPicture('one') as never)
      .mockResolvedValueOnce(withPicture('two') as never);
    await readTrackFile('/music/a.flac', root);
    fs.rmSync(folder(), { recursive: true });

    const track = await readTrackFile('/music/b.flac', root);

    expect(fs.readdirSync(folder())).toEqual([track.picture]);
  });

  it('keeps the picture that is stored already', async () => {
    vi.mocked(parseFile).mockResolvedValue(withPicture('same') as never);

    const first = await readTrackFile('/music/a.flac', root);
    const second = await readTrackFile('/music/b.flac', root);

    expect(second.picture).toBe(first.picture);
    expect(fs.readdirSync(folder())).toHaveLength(1);
  });
});
