import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Track } from '@shared/types/library';
import { findMissingTracks } from './missing-tracks';

const track = (trackPath: string): Track => ({
  path: trackPath,
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
});

describe('findMissingTracks', () => {
  let root: string;
  // the scan stores the paths with forward slashes
  const at = (...segments: string[]) => path.join(root, ...segments).replace(/\\/g, '/');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-missing-'));
    fs.mkdirSync(path.join(root, 'album'));
    fs.writeFileSync(path.join(root, 'album', 'one.flac'), '');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('finds the tracks whose file is gone, in a folder that is there and in one that is not', async () => {
    const tracks = [track(at('album', 'one.flac')), track(at('album', 'two.flac')), track(at('gone', 'three.flac'))];

    expect((await findMissingTracks(tracks, [root])).map((missing) => missing.path)).toEqual([at('album', 'two.flac'), at('gone', 'three.flac')]);
  });

  it('finds a track below a file, as that folder is gone', async () => {
    expect(await findMissingTracks([track(at('album', 'one.flac', 'inside.flac'))], [root])).toHaveLength(1);
  });

  it('keeps the tracks of a folder that cannot be read for another reason than that it is gone', async () => {
    const readdir = vi.spyOn(fs.promises, 'readdir').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));

    expect(await findMissingTracks([track(at('album', 'two.flac'))], [root])).toEqual([]);
    readdir.mockRestore();
  });

  it('reads a folder once for all its tracks', async () => {
    const readdir = vi.spyOn(fs.promises, 'readdir');
    await findMissingTracks([track(at('album', 'one.flac')), track(at('album', 'two.flac')), track(at('album', 'three.flac'))], [root]);

    expect(readdir).toHaveBeenCalledTimes(1);
    readdir.mockRestore();
  });

  it('finds nothing among no tracks', async () => {
    expect(await findMissingTracks([], [root])).toEqual([]);
  });
});
