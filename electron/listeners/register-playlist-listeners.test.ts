import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialog } from 'electron';
import type { IpcMainEvent } from 'electron';
import type { PlaylistImportReport, StoredPlaylist } from '@shared/types/playlists';
import type { ListenerContext } from './listener-context';
import registerPlaylistListeners from './register-playlist-listeners';
import {
  addEntries,
  createPlaylist,
  deletePlaylist,
  getPlaylists,
  moveEntry,
  movePlaylist,
  removeEntry,
  renamePlaylist,
  setEncodingOverride,
  setPlaylistSync,
  undoImport,
} from '../repositories/playlist-repository';
import { findTrackFormat } from '../repositories/library-repository';
import { exportPlaylist, writeBackPlaylist } from '../library/playlists/export-playlist';
import { importPlaylistFiles, reimportPlaylistFile } from '../library/playlists/import-playlist-files';
import { handleWriteFailure } from '../library/playlists/handle-write-failure';
import { fakeDatabase } from '../test-fake-database';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

// what the listeners call is replaced: the database, the repositories of the playlists and of the library
vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
  BrowserWindow: { fromWebContents: () => null },
  app: { getLocale: () => 'en-US' },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
}));
vi.mock('../library/playlists/import-playlist-files', () => ({ importPlaylistFiles: vi.fn(), reimportPlaylistFile: vi.fn() }));
vi.mock('../repositories/playlist-repository', () => ({
  addEntries: vi.fn(),
  createPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  getPlaylists: vi.fn(),
  getImportedPlaylists: vi.fn().mockResolvedValue([]),
  setPlaylistSync: vi.fn(),
  setEncodingOverride: vi.fn(),
  undoImport: vi.fn(),
  moveEntry: vi.fn(),
  movePlaylist: vi.fn(),
  removeEntry: vi.fn(),
  renamePlaylist: vi.fn(),
}));
vi.mock('../library/playlists/handle-write-failure', () => ({ handleWriteFailure: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../library/playlists/export-playlist', () => ({ exportPlaylist: vi.fn(), writeBackPlaylist: vi.fn() }));
vi.mock('../repositories/library-repository', () => ({ findTrackFormat: vi.fn(), getTrackListByPaths: vi.fn().mockResolvedValue([]) }));

const track = { path: '/music/a.flac', title: 'A' };
const format = {
  codec: 'FLAC',
  bitDepth: 16,
  sampleRate: 44100,
  bitrate: null,
  vbr: null,
  lossless: 1,
  trackGain: null,
  albumGain: null,
  trackPeak: null,
  albumPeak: null,
};
const stored: StoredPlaylist[] = [
  {
    id: 7,
    name: 'Road',
    entries: [
      { id: 1, path: '/music/a.flac', snapshot: track },
      { id: 2, path: '/music/gone.flac', snapshot: { path: '/music/gone.flac', title: 'Gone' } },
    ],
  },
];

describe('registerPlaylistListeners', () => {
  const database = fakeDatabase();
  const send = vi.fn();
  const event = { sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent;
  /** What the listeners do is a chain of promises that are all answered at once: the time goes by until they are done */
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const call = async (channel: string, payload?: unknown) => {
    listeners.get(channel)?.(event, payload);
    await flush();
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    listeners.clear();
    send.mockReset();
    vi.mocked(getPlaylists).mockReset().mockResolvedValue(stored);
    vi.mocked(createPlaylist).mockReset().mockResolvedValue(7);
    vi.mocked(addEntries).mockReset().mockResolvedValue(undefined);
    vi.mocked(renamePlaylist).mockReset().mockResolvedValue([]);
    vi.mocked(deletePlaylist).mockReset().mockResolvedValue([]);
    vi.mocked(movePlaylist).mockReset().mockResolvedValue([]);
    vi.mocked(removeEntry).mockReset().mockResolvedValue([]);
    vi.mocked(moveEntry).mockReset().mockResolvedValue([]);
    vi.mocked(setPlaylistSync).mockReset().mockResolvedValue([]);
    vi.mocked(writeBackPlaylist).mockReset().mockResolvedValue(undefined);
    vi.mocked(exportPlaylist).mockReset().mockResolvedValue({ onAnotherDrive: 0 });
    vi.mocked(setEncodingOverride).mockReset().mockResolvedValue([]);
    vi.mocked(reimportPlaylistFile).mockReset().mockResolvedValue(undefined);
    vi.mocked(undoImport).mockReset().mockResolvedValue(true);
    vi.mocked(importPlaylistFiles).mockReset().mockResolvedValue([]);
    vi.mocked(dialog.showOpenDialog).mockReset().mockResolvedValue({ canceled: true, filePaths: [] });
    vi.mocked(dialog.showSaveDialog).mockReset().mockResolvedValue({ canceled: true, filePath: '' });
    vi.mocked(findTrackFormat)
      .mockReset()
      .mockImplementation(async (_database, path) => (path === '/music/gone.flac' ? undefined : format));
    registerPlaylistListeners({ database } as unknown as ListenerContext);
  });

  afterEach(() => vi.useRealTimers());

  it('sends the playlists when the window asks for them', async () => {
    await call('PLAYLISTS_LOAD');

    expect(getPlaylists).toHaveBeenCalledWith(database);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('PLAYLISTS', { playlists: [expect.objectContaining({ id: 7, name: 'Road' })] });
  });

  it('tells which tracks the library still has, and keeps the others as they were saved', async () => {
    await call('PLAYLISTS_LOAD');

    const [{ entries }] = send.mock.calls[0][1].playlists;
    expect(entries.map(({ id, available }: { id: number; available: boolean }) => [id, available])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(entries[1].track).toEqual({ path: '/music/gone.flac', title: 'Gone' });
  });

  it('shows the format the library reads of a track, not the one of the snapshot that was saved before', async () => {
    await call('PLAYLISTS_LOAD');

    expect(send.mock.calls[0][1].playlists[0].entries[0].track).toMatchObject({ title: 'A', codec: 'FLAC', lossless: 1 });
    expect(findTrackFormat).toHaveBeenCalledWith(database, '/music/a.flac');
  });

  it('creates a playlist with a name that is trimmed and the tracks it is given, drops what is not a track, and sends the list', async () => {
    await call('PLAYLIST_CREATE', { name: '  Road  ', tracks: [track, { title: 'no path' }, 'text', null] });

    expect(createPlaylist).toHaveBeenCalledWith(database, 'Road');
    expect(addEntries).toHaveBeenCalledWith(database, 7, [{ path: '/music/a.flac', snapshot: track }]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('creates a playlist without tracks', async () => {
    await call('PLAYLIST_CREATE', { name: 'Road' });

    expect(addEntries).toHaveBeenCalledWith(database, 7, []);
  });

  it('writes a change of a playlist back to its file, and hands a failure to the handler and tells the window all the same', async () => {
    const failure = new Error('read only');
    vi.mocked(writeBackPlaylist).mockRejectedValue(failure);

    await call('PLAYLIST_RENAME', { id: 7, name: 'Night' });

    expect(writeBackPlaylist).toHaveBeenCalledWith(database, 7);
    expect(handleWriteFailure).toHaveBeenCalledWith(database, null, 7, failure);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('turns the sync of a playlist on and writes the file at once, and off without writing', async () => {
    await call('PLAYLIST_SYNC', { id: 7, sync: true });
    await call('PLAYLIST_SYNC', { id: 7, sync: false });

    expect(setPlaylistSync).toHaveBeenNthCalledWith(1, database, 7, true);
    expect(setPlaylistSync).toHaveBeenNthCalledWith(2, database, 7, false);
    expect(writeBackPlaylist).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'PLAYLIST_ADD',
      { id: 7, tracks: [track, { path: '/music/gone.flac' }] },
      addEntries,
      [
        7,
        [
          { path: '/music/a.flac', snapshot: track },
          { path: '/music/gone.flac', snapshot: { path: '/music/gone.flac' } },
        ],
      ],
    ],
    ['PLAYLIST_RENAME', { id: 7, name: ' Night ' }, renamePlaylist, [7, 'Night']],
    ['PLAYLIST_DELETE', { id: 7 }, deletePlaylist, [7]],
    ['PLAYLIST_MOVE', { id: 7, toIndex: 2 }, movePlaylist, [7, 2]],
    ['PLAYLIST_REMOVE_ENTRY', { id: 7, entryId: 3 }, removeEntry, [7, 3]],
    ['PLAYLIST_MOVE_ENTRY', { id: 7, entryId: 3, toIndex: 0 }, moveEntry, [7, 3, 0]],
  ])('on %s asks the repository and then sends the list', async (channel, payload, repository, args) => {
    await call(channel, payload);

    expect(repository).toHaveBeenCalledWith(database, ...args);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PLAYLIST_CREATE', undefined],
    ['PLAYLIST_CREATE', { name: '   ' }],
    ['PLAYLIST_CREATE', { name: 1 }],
    ['PLAYLIST_RENAME', { id: '1', name: 'A' }],
    ['PLAYLIST_RENAME', { id: 1, name: '' }],
    ['PLAYLIST_DELETE', { id: 1.5 }],
    ['PLAYLIST_MOVE', { id: 1 }],
    ['PLAYLIST_ADD', { tracks: [track] }],
    ['PLAYLIST_REMOVE_ENTRY', { id: 1 }],
    ['PLAYLIST_MOVE_ENTRY', { id: 1, entryId: 1, toIndex: 'x' }],
  ])('ignores the malformed %s message %j', async (channel, payload) => {
    await call(channel, payload);

    [createPlaylist, addEntries, renamePlaylist, deletePlaylist, movePlaylist, removeEntry, moveEntry].forEach((repository) =>
      expect(repository).not.toHaveBeenCalled()
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('imports the files that are picked, then sends the playlists and the report', async () => {
    const reports: PlaylistImportReport[] = [{ fileName: '/lists/mix.m3u', name: 'mix', status: 'created', imported: 1, unmatched: [], streams: 0 }];
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/lists/mix.m3u'] });
    vi.mocked(importPlaylistFiles).mockResolvedValue(reports);

    await call('PLAYLIST_IMPORT');

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ['openFile', 'multiSelections'],
        filters: [expect.objectContaining({ extensions: ['m3u', 'm3u8', 'pls', 'xspf'] })],
      })
    );
    expect(importPlaylistFiles).toHaveBeenCalledWith(database, ['/lists/mix.m3u']);
    expect(send.mock.calls.map(([channel]) => channel)).toEqual(['PLAYLISTS', 'PLAYLIST_IMPORT_REPORT']);
    expect(send).toHaveBeenLastCalledWith('PLAYLIST_IMPORT_REPORT', { reports });
  });

  it('imports nothing and tells nothing when the dialog is closed', async () => {
    await call('PLAYLIST_IMPORT');

    expect(importPlaylistFiles).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('logs an import that fails and sends nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/lists/mix.m3u'] });
    vi.mocked(importPlaylistFiles).mockRejectedValue(new Error('no database'));

    await call('PLAYLIST_IMPORT');

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'no database' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('exports the playlist to the file that is picked, offering its name as .m3u8 first', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/lists/Road.xspf' });

    await call('PLAYLIST_EXPORT', { id: 7 });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'Road.m3u8',
        filters: [
          { name: 'M3U8 (UTF-8)', extensions: ['m3u8'] },
          { name: 'M3U', extensions: ['m3u'] },
          { name: 'PLS', extensions: ['pls'] },
          { name: 'XSPF', extensions: ['xspf'] },
        ],
      })
    );
    expect(exportPlaylist).toHaveBeenCalledWith(database, 7, '/lists/Road.xspf');
  });

  it('tells the user when tracks are written with their full path as they are on another drive, and says nothing otherwise', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/lists/Road.xspf' });
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
    vi.mocked(exportPlaylist).mockResolvedValueOnce({ onAnotherDrive: 2 }).mockResolvedValueOnce({ onAnotherDrive: 0 });

    await call('PLAYLIST_EXPORT', { id: 7 });
    await call('PLAYLIST_EXPORT', { id: 7 });

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ message: '2 tracks are on another drive than the file, so they are written with their full path.' })
    );
  });

  it('sets the encoding the user chose, reads the file again with it, and tells the window', async () => {
    await call('PLAYLIST_ENCODING', { id: 7, encoding: 'windows-1251' });

    expect(setEncodingOverride).toHaveBeenCalledWith(database, 7, 'windows-1251');
    expect(reimportPlaylistFile).toHaveBeenCalledWith(database, 7);
    expect(send).toHaveBeenCalledWith('PLAYLISTS', expect.anything());
  });

  it('goes back to the detected encoding when none is given, and ignores an encoding that is not one', async () => {
    await call('PLAYLIST_ENCODING', { id: 7 });
    await call('PLAYLIST_ENCODING', { id: 7, encoding: 'klingon' });

    expect(setEncodingOverride).toHaveBeenCalledTimes(1);
    expect(setEncodingOverride).toHaveBeenCalledWith(database, 7, undefined);
  });

  it('undoes the last read of the file, writes the playlist back to the file, and tells the window', async () => {
    await call('PLAYLIST_UNDO_IMPORT', { id: 7 });

    expect(undoImport).toHaveBeenCalledWith(database, 7);
    expect(writeBackPlaylist).toHaveBeenCalledWith(database, 7);
    expect(send).toHaveBeenCalledWith('PLAYLISTS', expect.anything());
  });

  it('ignores an undo of a malformed message', async () => {
    await call('PLAYLIST_UNDO_IMPORT', { id: 'x' });

    expect(undoImport).not.toHaveBeenCalled();
  });

  it('offers "playlist" as the name of a playlist that is not there', async () => {
    await call('PLAYLIST_EXPORT', { id: 99 });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'playlist.m3u8' }));
  });

  it('writes no file when the save dialog is closed', async () => {
    await call('PLAYLIST_EXPORT', { id: 7 });

    expect(exportPlaylist).not.toHaveBeenCalled();
  });

  it('hands a failed export to the handler', async () => {
    const failure = new Error('read only');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/lists/Road.m3u8' });
    vi.mocked(exportPlaylist).mockRejectedValue(failure);

    await call('PLAYLIST_EXPORT', { id: 7 });

    expect(handleWriteFailure).toHaveBeenCalledWith(database, null, 7, failure);
  });

  it.each([
    ['PLAYLIST_EXPORT', undefined],
    ['PLAYLIST_EXPORT', { id: '7' }],
    ['PLAYLIST_SYNC', { id: 7 }],
    ['PLAYLIST_SYNC', { id: 7, sync: 'yes' }],
  ])('ignores the malformed %s message %j', async (channel, payload) => {
    await call(channel, payload);

    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
    expect(setPlaylistSync).not.toHaveBeenCalled();
  });

  it('logs a failure and sends nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(deletePlaylist).mockRejectedValue(new Error('disk full'));

    await call('PLAYLIST_DELETE', { id: 7 });

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send to a window that was closed meanwhile', async () => {
    const isDestroyed = vi.fn(() => true);
    listeners.get('PLAYLISTS_LOAD')?.({ sender: { send, isDestroyed } } as unknown as IpcMainEvent);
    await flush();

    expect(isDestroyed).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
