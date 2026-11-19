import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { getLibraryPaths, getTrackListByPaths } from '../../repositories/library-repository';
import {
  addEntries,
  createImportedPlaylist,
  getImportedPlaylists,
  getPlaylistNames,
  replaceImportedEntries,
  touchImportedPlaylist,
} from '../../repositories/playlist-repository';
import { memoryFs } from '../../test-memory-fs';
import { fakeDatabase } from '../../test-fake-database';
import { importPlaylistFiles, reimportPlaylistFile } from './import-playlist-files';

vi.mock('fs', () => ({ ...memoryFs.sync, default: { ...memoryFs.sync, promises: memoryFs.promises } }));
vi.mock('../../repositories/library-repository', () => ({ getLibraryPaths: vi.fn(), getTrackListByPaths: vi.fn() }));
vi.mock('../../repositories/playlist-repository', () => ({
  addEntries: vi.fn(),
  createImportedPlaylist: vi.fn(),
  getImportedPlaylists: vi.fn(),
  getPlaylistNames: vi.fn(),
  replaceImportedEntries: vi.fn(),
  touchImportedPlaylist: vi.fn(),
}));

const database = fakeDatabase();
const content = '#EXTM3U\n#EXTINF:61,Adam - A\n/music/a.flac\nhttp://radio.example/live\n/music/gone.flac\n';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const track = { path: '/music/a.flac', title: 'A' };
const linked = (values = {}) => ({
  id: 5,
  name: 'Mix',
  sourcePath: '/lists/mix.m3u',
  checksum: sha(content),
  modified: 1000,
  encoding: 'utf-8',
  encodingOverride: null,
  sync: true,
  canUndo: false,
  ...values,
});

/** The file is read from one open handle, whose modification time the test sets */
const file = (path: string, text: string, mtimeMs = 1000) =>
  vi.spyOn(memoryFs.promises, 'open').mockImplementation(async (opened: string) => {
    if (opened !== path) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return { stat: async () => ({ size: text.length, mtimeMs }), readFile: async () => Buffer.from(text), close: async () => undefined };
  });

describe('importing playlist files', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getLibraryPaths).mockReset().mockResolvedValue(['/music/a.flac']);
    vi.mocked(getTrackListByPaths)
      .mockReset()
      .mockResolvedValue([track] as never);
    vi.mocked(getImportedPlaylists).mockReset().mockResolvedValue([]);
    vi.mocked(getPlaylistNames).mockReset().mockResolvedValue([]);
    vi.mocked(createImportedPlaylist).mockReset().mockResolvedValue(9);
    [addEntries, replaceImportedEntries, touchImportedPlaylist].forEach((fn) =>
      vi
        .mocked(fn)
        .mockReset()
        .mockResolvedValue(undefined as never)
    );
  });

  it('creates a playlist from a file, with the tracks of the library, the files it does not know and the streams it counts', async () => {
    file('/lists/mix.m3u', content);

    const [report] = await importPlaylistFiles(database, ['/lists/mix.m3u', '/lists/notes.txt']);

    expect(report).toMatchObject({ fileName: '/lists/mix.m3u', name: 'mix', status: 'created', imported: 2, streams: 1 });
    expect(report.unmatched).toHaveLength(1);
    expect(vi.mocked(createImportedPlaylist).mock.calls[0][2]).toEqual({ path: '/lists/mix.m3u', checksum: sha(content), modified: 1000, encoding: 'utf-8' });
    const [, id, tracks] = vi.mocked(addEntries).mock.calls[0];
    expect(id).toBe(9);
    expect(tracks.map(({ path }) => path)).toEqual(['/music/a.flac', '/music/gone.flac']);
    expect(tracks[1].snapshot).toMatchObject({ title: 'gone' });
  });

  it('takes a name that is free: the folder, then a number', async () => {
    file('/lists/mix.m3u', '/music/a.flac\n');
    vi.mocked(getPlaylistNames).mockResolvedValue(['mix']);
    expect((await importPlaylistFiles(database, ['/lists/mix.m3u']))[0].name).toBe('mix (lists)');

    vi.mocked(getPlaylistNames).mockResolvedValue(['mix', 'mix (lists)']);
    expect((await importPlaylistFiles(database, ['/lists/mix.m3u']))[0].name).toBe('mix (2)');
  });

  it('leaves a playlist alone when the file has the time it was read at, and only stores the time when the content is the same', async () => {
    vi.mocked(getImportedPlaylists).mockResolvedValue([linked()]);
    file('/lists/mix.m3u', content, 1000);
    expect((await importPlaylistFiles(database, ['/lists/mix.m3u']))[0]).toMatchObject({ status: 'unchanged', name: 'Mix' });
    expect(touchImportedPlaylist).not.toHaveBeenCalled();

    file('/lists/mix.m3u', content, 2000);
    expect((await importPlaylistFiles(database, ['/lists/mix.m3u']))[0].status).toBe('unchanged');
    expect(touchImportedPlaylist).toHaveBeenCalledWith(database, 5, 2000);
  });

  it('replaces the entries of a playlist whose file changed, and keeps its name', async () => {
    vi.mocked(getImportedPlaylists).mockResolvedValue([linked()]);
    file('/lists/mix.m3u', '/music/a.flac\n', 2000);

    const [report] = await importPlaylistFiles(database, ['/lists/mix.m3u']);

    expect(report).toMatchObject({ status: 'updated', name: 'Mix', imported: 1 });
    expect(replaceImportedEntries).toHaveBeenCalledWith(database, 5, expect.objectContaining({ modified: 2000 }), [{ path: '/music/a.flac', snapshot: track }]);
  });

  it('logs a file that cannot be read and leaves it out of the reports', async () => {
    vi.spyOn(memoryFs.promises, 'open').mockRejectedValue(new Error('EACCES'));

    expect(await importPlaylistFiles(database, ['/lists/mix.m3u'])).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('Importing the playlist /lists/mix.m3u failed', expect.any(Error));
  });

  it('reads a file again when the user chose another encoding, even when it did not change', async () => {
    vi.mocked(getImportedPlaylists).mockResolvedValue([linked({ encodingOverride: 'windows-1252' })]);
    file('/lists/mix.m3u', content, 1000);

    expect(await reimportPlaylistFile(database, 5)).toMatchObject({ status: 'updated' });
    expect(replaceImportedEntries).toHaveBeenCalled();
  });

  it('has nothing to read again for a playlist without a file or with a file that is no playlist', async () => {
    expect(await reimportPlaylistFile(database, 5)).toBeUndefined();

    vi.mocked(getImportedPlaylists).mockResolvedValue([linked({ sourcePath: '/lists/notes.txt' })]);
    expect(await reimportPlaylistFile(database, 5)).toBeUndefined();

    vi.mocked(getImportedPlaylists).mockResolvedValue([linked()]);
    vi.spyOn(memoryFs.promises, 'open').mockRejectedValue(new Error('gone'));
    expect(await reimportPlaylistFile(database, 5)).toBeUndefined();
  });
});
