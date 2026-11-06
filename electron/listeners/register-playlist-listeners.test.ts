import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from 'sqlite3';
import type { IpcMainEvent } from 'electron';
import type { StoredPlaylist } from '@shared/types/playlists';
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
} from '../repositories/playlist-repository';
import { findTrackFormat } from '../repositories/library-repository';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

// what the listeners call is replaced: the database, the repositories of the playlists and of the library
vi.mock('sqlite3', () => ({ Database: class {} }));
vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));
vi.mock('../repositories/playlist-repository', () => ({
  addEntries: vi.fn(),
  createPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  getPlaylists: vi.fn(),
  moveEntry: vi.fn(),
  movePlaylist: vi.fn(),
  removeEntry: vi.fn(),
  renamePlaylist: vi.fn(),
}));
vi.mock('../repositories/library-repository', () => ({ findTrackFormat: vi.fn() }));

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
  const database = new Database(':memory:');
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
