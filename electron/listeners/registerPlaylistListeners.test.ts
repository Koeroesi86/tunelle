import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sqlite3';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listenerContext';
import registerPlaylistListeners from './registerPlaylistListeners';
import addTrack from '../addTrack';
import { createTestDatabase } from '../test-database';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));

const track = { path: '/music/a.flac', title: 'A' };

describe('registerPlaylistListeners', () => {
  const send = vi.fn();
  const event = { sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent;
  let database: Database;

  beforeEach(async () => {
    listeners.clear();
    send.mockReset();
    database = await createTestDatabase();
    registerPlaylistListeners({ database } as unknown as ListenerContext);
  });

  const call = async (channel: string, payload?: unknown) => {
    const calls = send.mock.calls.length;
    listeners.get(channel)?.(event, payload);
    await vi.waitFor(() => expect(send.mock.calls.length).toBe(calls + 1));
    return send.mock.calls.at(-1)?.[1].playlists;
  };

  it('sends the playlists when the window asks for them', async () => {
    expect(await call('PLAYLISTS_LOAD')).toEqual([]);
  });

  it('creates a playlist with the tracks it is given and drops what is not a track', async () => {
    const playlists = await call('PLAYLIST_CREATE', { name: '  Road  ', tracks: [track, { title: 'no path' }, 'text', null] });

    expect(playlists).toEqual([{ id: expect.any(Number), name: 'Road', entries: [{ id: expect.any(Number), track, available: false }] }]);
  });

  it('tells which tracks the library still has', async () => {
    await addTrack(database, { ...track, artist: '', album: '', year: '', track: '', disk: '', genre: '', picture: null, duration: 1 });
    const [{ id }] = await call('PLAYLIST_CREATE', { name: 'Road' }).then(async () => call('PLAYLISTS_LOAD'));

    const [playlist] = await call('PLAYLIST_ADD', { id, tracks: [track, { path: '/music/gone.flac' }] });

    expect(playlist.entries.map(({ available }: { available: boolean }) => available)).toEqual([true, false]);
  });

  it('shows the format the library reads of a track, not the one of the snapshot that was saved before', async () => {
    await addTrack(database, {
      ...track,
      artist: '',
      album: '',
      year: '',
      track: '',
      disk: '',
      genre: '',
      picture: null,
      duration: 1,
      codec: 'FLAC',
      lossless: 1,
    });

    const [playlist] = await call('PLAYLIST_CREATE', { name: 'Road', tracks: [track] });

    expect(playlist.entries[0].track).toMatchObject({ title: 'A', codec: 'FLAC', lossless: 1 });
  });

  it('renames, moves entries and deletes', async () => {
    const [{ id }] = await call('PLAYLIST_CREATE', { name: 'Road', tracks: [track, { path: '/b' }] });

    const [renamed] = await call('PLAYLIST_RENAME', { id, name: 'Night' });
    const [moved] = await call('PLAYLIST_MOVE_ENTRY', { id, entryId: renamed.entries[1].id, toIndex: 0 });
    const [removed] = await call('PLAYLIST_REMOVE_ENTRY', { id, entryId: moved.entries[0].id });

    expect([renamed.name, moved.entries[0].track.path, removed.entries.length]).toEqual(['Night', '/b', 1]);
    expect(await call('PLAYLIST_DELETE', { id })).toEqual([]);
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
    listeners.get(channel)?.(event, payload);

    expect(await call('PLAYLISTS_LOAD')).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send to a window that was closed meanwhile', async () => {
    const isDestroyed = vi.fn(() => true);
    listeners.get('PLAYLISTS_LOAD')?.({ sender: { send, isDestroyed } } as unknown as IpcMainEvent);
    await vi.waitFor(() => expect(isDestroyed).toHaveBeenCalled());

    expect(send).not.toHaveBeenCalled();
  });
});
