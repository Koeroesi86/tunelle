import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@shared/types/library';
import { mountGuard } from '../mounts/mount-guard';
import { findMissingTracks } from './missing-tracks';

vi.mock('../mounts/mount-guard', () => ({ mountGuard: vi.fn() }));

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
  const root = '/music';
  const at = (...segments: string[]) => [root, ...segments].join('/');
  const list = vi.fn();

  beforeEach(() => {
    // /music/album has one.flac, /music/gone and anything below a file are gone
    list.mockReset().mockImplementation(async (_mount: string, folder: string) => (folder === at('album') ? { names: ['one.flac'] } : { code: 'ENOENT' }));
    vi.mocked(mountGuard).mockReturnValue({ list } as unknown as ReturnType<typeof mountGuard>);
  });

  it('finds the tracks whose file is gone, in a folder that is there and in one that is not', async () => {
    const tracks = [track(at('album', 'one.flac')), track(at('album', 'two.flac')), track(at('gone', 'three.flac'))];

    expect((await findMissingTracks(tracks, [root])).map((missing) => missing.path)).toEqual([at('album', 'two.flac'), at('gone', 'three.flac')]);
  });

  it('finds a track below a file, as that folder is gone', async () => {
    list.mockResolvedValue({ code: 'ENOTDIR' });

    expect(await findMissingTracks([track(at('album', 'one.flac', 'inside.flac'))], [root])).toHaveLength(1);
  });

  // macOS answers EPERM for a protected folder that the app has no access to (again) after an update
  it.each(['EACCES', 'EPERM'])('keeps the tracks of a folder that cannot be read for another reason than that it is gone: %s', async (code) => {
    list.mockResolvedValue({ code });

    expect(await findMissingTracks([track(at('album', 'two.flac'))], [root])).toEqual([]);
  });

  it('keeps the tracks of a folder that does not answer', async () => {
    list.mockResolvedValue({});

    expect(await findMissingTracks([track(at('album', 'two.flac'))], [root])).toEqual([]);
  });

  it('reads a folder once for all its tracks, by the process of the library folder it is in', async () => {
    await findMissingTracks([track(at('album', 'one.flac')), track(at('album', 'two.flac')), track(at('album', 'three.flac'))], [root]);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(root, at('album'));
  });

  it('finds nothing among no tracks', async () => {
    expect(await findMissingTracks([], [root])).toEqual([]);
  });
});
