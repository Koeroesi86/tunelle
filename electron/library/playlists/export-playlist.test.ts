import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { getFolders } from '../../repositories/library-repository';
import { getImportedPlaylists, getPlaylists, markPlaylistWritten, relinkPlaylistFile } from '../../repositories/playlist-repository';
import { memoryFs } from '../../test-memory-fs';
import { fakeDatabase } from '../../test-fake-database';
import { exportPlaylist, PlaylistWriteError, switchToM3u8, writeBackPlaylist } from './export-playlist';
import { retirePlaylistFile, writePlaylistFile } from './write-playlist-file';

vi.mock('fs', () => ({ ...memoryFs.sync, default: { ...memoryFs.sync, promises: memoryFs.promises } }));
vi.mock('../../repositories/library-repository', () => ({ getFolders: vi.fn() }));
vi.mock('../../repositories/playlist-repository', () => ({
  getImportedPlaylists: vi.fn(),
  getPlaylists: vi.fn(),
  markPlaylistWritten: vi.fn(),
  relinkPlaylistFile: vi.fn(),
}));
vi.mock('./write-playlist-file', () => ({ writePlaylistFile: vi.fn(), retirePlaylistFile: vi.fn() }));

const database = fakeDatabase();
const playlist = {
  id: 1,
  name: 'Mix',
  entries: [
    { id: 1, path: '/music/a.flac', snapshot: { title: 'A', artist: 'Adam', album: 'One', duration: 61 } },
    { id: 2, path: '/other/b.flac', snapshot: null },
  ],
};
const imported = (values = {}) => ({
  id: 1,
  name: 'Mix',
  sourcePath: '/lists/mix.m3u',
  checksum: 'c',
  modified: 1,
  encoding: 'utf-8',
  encodingOverride: null,
  sync: true,
  canUndo: false,
  ...values,
});
const written = () => Buffer.from(vi.mocked(writePlaylistFile).mock.calls.at(-1)?.[1] ?? '').toString('utf8');

describe('exporting a playlist', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/lists');
    vi.mocked(getFolders)
      .mockReset()
      .mockResolvedValue([{ path: '/music', lastModified: 1 }]);
    vi.mocked(getPlaylists)
      .mockReset()
      .mockResolvedValue([playlist] as never);
    vi.mocked(getImportedPlaylists).mockReset().mockResolvedValue([]);
    vi.mocked(markPlaylistWritten).mockReset();
    vi.mocked(relinkPlaylistFile).mockReset();
    vi.mocked(writePlaylistFile).mockReset().mockResolvedValue(77);
    vi.mocked(retirePlaylistFile).mockReset().mockResolvedValue(undefined);
  });

  it('writes a copy in the format of the extension, with a backup, and counts the entries on another drive', async () => {
    const result = await exportPlaylist(database, 1, '/lists/mix.m3u8');

    expect(written()).toContain('#EXTM3U');
    expect(written()).toContain('/music/a.flac');
    expect(vi.mocked(writePlaylistFile).mock.calls[0][2]).toBe(true);
    expect(result).toEqual({ onAnotherDrive: expect.any(Number) });
  });

  it('writes nothing for a playlist that is not there or an extension that is no format', async () => {
    expect(await exportPlaylist(database, 9, '/lists/mix.m3u8')).toEqual({ onAnotherDrive: 0 });
    expect(await exportPlaylist(database, 1, '/lists/mix.txt')).toEqual({ onAnotherDrive: 0 });
    expect(writePlaylistFile).not.toHaveBeenCalled();
  });

  it('fails as a write error when the file cannot be written, and when the text does not fit the encoding', async () => {
    vi.mocked(writePlaylistFile).mockRejectedValueOnce(new Error('EACCES'));
    await expect(exportPlaylist(database, 1, '/lists/mix.m3u8')).rejects.toMatchObject({ kind: 'failed', filePath: '/lists/mix.m3u8' });

    vi.mocked(getPlaylists).mockResolvedValue([{ ...playlist, name: 'Mix', entries: [{ id: 1, path: '/music/日本.flac', snapshot: null }] }] as never);
    vi.mocked(getImportedPlaylists).mockResolvedValue([imported({ encoding: 'windows-1252' })]);
    await expect(writeBackPlaylist(database, 1)).rejects.toBeInstanceOf(PlaylistWriteError);
    await expect(writeBackPlaylist(database, 1)).rejects.toMatchObject({ kind: 'encoding' });
  });

  it('writes a playlist back to its file and stores what was written, and does nothing without a file or with the sync off', async () => {
    await writeBackPlaylist(database, 1);
    expect(writePlaylistFile).not.toHaveBeenCalled();

    vi.mocked(getImportedPlaylists).mockResolvedValue([imported({ sync: false })]);
    await writeBackPlaylist(database, 1);
    expect(writePlaylistFile).not.toHaveBeenCalled();

    vi.mocked(getImportedPlaylists).mockResolvedValue([imported()]);
    await writeBackPlaylist(database, 1);

    expect(vi.mocked(writePlaylistFile).mock.calls[0][0]).toBe('/lists/mix.m3u');
    expect(markPlaylistWritten).toHaveBeenCalledWith(database, 1, {
      checksum: createHash('sha256').update(Buffer.from(written())).digest('hex'),
      modified: 77,
      encoding: 'utf-8',
      onAnotherDrive: expect.any(Number),
    });
  });

  it('keeps the lines of the file that the app does not write, when it writes back', async () => {
    memoryFs.sync.writeFileSync('/lists/mix.m3u', '#EXTM3U\n#PLAYLIST:keep me\n/music/old.flac\n');
    vi.mocked(getImportedPlaylists).mockResolvedValue([imported()]);

    await writeBackPlaylist(database, 1);

    expect(written()).toContain('/music/a.flac');
  });

  it('writes the playlist as .m3u8 beside the old file, links it, and retires the old one', async () => {
    vi.mocked(getImportedPlaylists).mockResolvedValue([imported()]);

    await switchToM3u8(database, 1);

    expect(vi.mocked(writePlaylistFile).mock.calls[0][0]).toBe('/lists/mix.m3u8');
    expect(vi.mocked(writePlaylistFile).mock.calls[0][2]).toBe(false);
    expect(relinkPlaylistFile).toHaveBeenCalledWith(database, 1, expect.objectContaining({ path: '/lists/mix.m3u8', modified: 77 }));
    expect(retirePlaylistFile).toHaveBeenCalledWith('/lists/mix.m3u');
  });

  it('fails when the name of the .m3u8 is taken or the file is already .m3u8, and when the old file cannot be retired', async () => {
    vi.mocked(getImportedPlaylists).mockResolvedValue([imported()]);
    memoryFs.sync.writeFileSync('/lists/mix.m3u8', 'x');
    await expect(switchToM3u8(database, 1)).rejects.toMatchObject({ kind: 'failed', filePath: '/lists/mix.m3u8' });

    vi.mocked(getImportedPlaylists).mockResolvedValue([imported({ sourcePath: '/lists/other.m3u8' })]);
    await expect(switchToM3u8(database, 1)).rejects.toBeInstanceOf(PlaylistWriteError);

    memoryFs.reset();
    memoryFs.sync.mkdirSync('/lists');
    vi.mocked(getImportedPlaylists).mockResolvedValue([imported()]);
    vi.mocked(retirePlaylistFile).mockRejectedValueOnce(new Error('EBUSY'));
    await expect(switchToM3u8(database, 1)).rejects.toMatchObject({ filePath: '/lists/mix.m3u' });
  });

  it('does nothing for a playlist without a file, and when the playlist is gone', async () => {
    await switchToM3u8(database, 1);
    vi.mocked(getImportedPlaylists).mockResolvedValue([imported()]);
    vi.mocked(getPlaylists).mockResolvedValue([]);
    await switchToM3u8(database, 1);

    expect(relinkPlaylistFile).not.toHaveBeenCalled();
  });
});
