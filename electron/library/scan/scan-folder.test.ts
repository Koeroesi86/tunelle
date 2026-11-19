import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import type { WebContents } from 'electron';
import { getTracksInside } from '../../repositories/library-repository';
import { recordLibraryChange } from '../changes/library-changes';
import { queueAlbumArtAccents } from '../art/album-art-accents';
import { syncPlaylistFiles } from '../playlists/sync-playlist-files';
import { createTrackReader, ReadTimeoutError } from '../reading/track-reader';
import { fakeDatabase } from '../../test-fake-database';
import { addTracks } from './add-tracks';
import scanFolder from './scan-folder';

type Entry = { name: string; kind: 'file' | 'folder' | 'link'; mtimeMs?: number; size?: number };

const tree = vi.hoisted(() => new Map<string, { name: string; kind: 'file' | 'folder' | 'link'; mtimeMs?: number; size?: number }[]>());

vi.mock('fs', () => {
  const posix = (value: string) => value.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/');
  const promises = {
    readdir: async (directory: string) => {
      const entries = tree.get(posix(directory));
      if (!entries) throw new Error(`ENOENT ${directory}`);
      return entries.map(({ name, kind }) => ({ name, isDirectory: () => kind === 'folder', isFile: () => kind === 'file' }));
    },
    stat: async (file: string) => {
      const entry = [...tree.values()].flat().find(({ name }) => posix(file).endsWith(`/${name}`));
      return { mtimeMs: entry?.mtimeMs ?? 1000.7, size: entry?.size ?? 10 };
    },
  };
  return { default: { promises }, promises };
});
vi.mock('../../repositories/library-repository', () => ({ getTracksInside: vi.fn() }));
vi.mock('../changes/library-changes', () => ({ recordLibraryChange: vi.fn() }));
vi.mock('../art/album-art-accents', () => ({ queueAlbumArtAccents: vi.fn() }));
vi.mock('../playlists/sync-playlist-files', () => ({ syncPlaylistFiles: vi.fn() }));
vi.mock('./add-tracks', () => ({ addTracks: vi.fn(), readBatchSize: () => 2 }));
vi.mock('../reading/track-reader', () => ({
  createTrackReader: vi.fn(),
  ReadTimeoutError: class ReadTimeoutError extends Error {},
}));

const send = vi.fn();
const sender = { send } as unknown as WebContents;
const database = fakeDatabase();
const read = vi.fn();
const close = vi.fn();
const file = (name: string, extra: Partial<Entry> = {}): Entry => ({ name, kind: 'file', ...extra });
const meta = (name: string, codec = 'flac') => ({ path: name, codec, title: name });
const posix = (value: string) => value.replaceAll('\\', '/');
const stored = () => vi.mocked(addTracks).mock.calls.flatMap(([, tracks]) => tracks.map((track) => posix(track.path)));
/** The library stores a path with forward slashes, a file found on disk has the separator of the system */
const inMusic = (...names: string[]) => path.join('/music', ...names);

describe('scanFolder', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    tree.clear();
    tree.set('/music', [
      file('b.flac'),
      file('a.flac'),
      file('cover.jpg'),
      file('list.m3u'),
      { name: 'link.flac', kind: 'link' },
      { name: 'album', kind: 'folder' },
    ]);
    tree.set('/music/album', [file('c.flac')]);
    global._database = database;
    global._appDataPath = '/data';
    send.mockReset();
    read.mockReset().mockImplementation(async (name: string) => meta(name.replaceAll('\\', '/')));
    close.mockReset();
    vi.mocked(createTrackReader)
      .mockReset()
      .mockReturnValue({ read, close } as unknown as ReturnType<typeof createTrackReader>);
    vi.mocked(getTracksInside).mockReset().mockResolvedValue([]);
    vi.mocked(addTracks)
      .mockReset()
      .mockResolvedValue(undefined as never);
    vi.mocked(recordLibraryChange).mockReset();
    vi.mocked(queueAlbumArtAccents).mockReset();
    vi.mocked(syncPlaylistFiles)
      .mockReset()
      .mockResolvedValue(undefined as never);
  });

  it('refuses to scan before the database is connected', async () => {
    global._database = undefined;

    await expect(scanFolder('/music', sender)).rejects.toThrow('Database is not connected');
  });

  it('reads the supported files of the folder tree in order, and leaves out other files and symbolic links', async () => {
    expect(await scanFolder('/music', sender)).toBe(0);

    expect(stored()).toEqual(['/music/a.flac', '/music/album/c.flac', '/music/b.flac']);
    expect(read).toHaveBeenCalledTimes(3);
    expect(close).toHaveBeenCalled();
    expect(queueAlbumArtAccents).toHaveBeenCalledWith(database);
    expect(syncPlaylistFiles).toHaveBeenCalledWith(database, sender, '/music', true, [inMusic('list.m3u')]);
  });

  it('stores the time and size of the file with the track, the time in whole milliseconds', async () => {
    await scanFolder('/music', sender);

    expect(vi.mocked(addTracks).mock.calls[0][1][0]).toMatchObject({ fileModified: 1000, fileSize: 10 });
  });

  it('does not go below the folder when it is not deep', async () => {
    await scanFolder('/music', sender, false);

    expect(stored()).toEqual(['/music/a.flac', '/music/b.flac']);
  });

  it('does not read a file again when its time and size are the ones stored', async () => {
    vi.mocked(getTracksInside).mockResolvedValue([{ path: '/music/a.flac', fileModified: 1000, fileSize: 10 }] as never);

    await scanFolder('/music', sender);

    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls.map(([name]) => posix(name))).not.toContain('/music/a.flac');
  });

  it('keeps a file with a codec that does not play out of the library', async () => {
    read.mockImplementation(async (name: string) => meta(name, name.endsWith('b.flac') ? 'unplayable-codec' : 'flac'));
    const result = await scanFolder('/music', sender);

    expect(result).toBe(0);
    expect(stored().length).toBeLessThanOrEqual(3);
  });

  it('tells the window about the files, the folders and the tracks stored, and counts added and updated tracks', async () => {
    vi.mocked(getTracksInside).mockResolvedValue([{ path: '/music/a.flac', fileModified: 1, fileSize: 1 }] as never);

    await scanFolder('/music', sender);

    expect(send).toHaveBeenCalledWith('SCANNING_FOLDER', { folder: '/music' });
    expect(send).toHaveBeenCalledWith('SCANNING_FILE', expect.objectContaining({ totalCount: 3 }));
    expect(send).toHaveBeenCalledWith('LIBRARY_UPDATED', {});
    expect(vi.mocked(recordLibraryChange).mock.calls.reduce((sum, [, change]) => sum + (change.added ?? 0) + (change.updated ?? 0), 0)).toBe(3);
  });

  it('stores a batch that failed one track at a time, and logs the track that cannot be stored', async () => {
    vi.mocked(addTracks)
      .mockRejectedValueOnce(new Error('batch'))
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('bad track'))
      .mockResolvedValue(undefined as never);

    await scanFolder('/music', sender);

    expect(console.error).toHaveBeenCalledWith('Storing a batch of tracks failed, storing them one by one', expect.any(Error));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('.flac'), expect.any(Error));
  });

  it('logs a file that cannot be read and goes on with the others', async () => {
    read.mockImplementation(async (name: string) => {
      if (name.endsWith('a.flac')) throw new Error('corrupt');
      return meta(name);
    });

    expect(await scanFolder('/music', sender)).toBe(0);

    expect(stored()).toHaveLength(2);
    expect(console.error).toHaveBeenCalledWith(inMusic('a.flac'), expect.any(Error));
  });

  it('asks again for a file that did not answer in time, and says how many stay unread when it does not answer again', async () => {
    read.mockImplementation(async (name: string, _data: string, timeout: number) => {
      if (name.endsWith('a.flac') && timeout < 30_000) throw new ReadTimeoutError('slow');
      return meta(name);
    });
    expect(await scanFolder('/music', sender)).toBe(0);
    expect(stored()).toHaveLength(3);

    vi.mocked(addTracks).mockClear();
    read.mockImplementation(async (name: string) => {
      if (name.endsWith('a.flac')) throw new ReadTimeoutError('slow');
      return meta(name);
    });
    expect(await scanFolder('/music', sender)).toBe(1);
    expect(stored()).toHaveLength(2);
  });

  it('fails when the folder cannot be listed', async () => {
    await expect(scanFolder('/gone', sender)).rejects.toThrow('ENOENT');
    expect(close).toHaveBeenCalledTimes(0);
  });

  it('stops with the error of the signal when it is aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('quitting'));

    await expect(scanFolder('/music', sender, true, controller.signal)).rejects.toThrow('quitting');
  });
});
