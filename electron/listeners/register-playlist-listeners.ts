import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { PlaylistMessage, StoredPlaylist } from '@shared/types/playlists';
import type { ListenerContext } from './listener-context';
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
import { isRecord } from '@shared/utils/is-record';

const maxNameLength = 200;

const toName = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, maxNameLength) : '');

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/** The tracks of a renderer message, anything that is not a track with a path is dropped */
const toTracks = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((track: unknown) =>
    isRecord(track) && typeof track.path === 'string' && track.path.length > 0 ? [{ path: track.path, snapshot: track }] : []
  );

const withAvailability = (database: ListenerContext['database'], playlists: StoredPlaylist[]) =>
  Promise.all(
    playlists.map(async ({ id, name, entries }): Promise<PlaylistMessage> => {
      const formats = await Promise.all(entries.map(({ path }) => findTrackFormat(database, path)));

      return {
        id,
        name,
        // a track the library does not have is kept, shown from its snapshot and not played; one it has shows the format the library reads of it now
        entries: entries.map(({ id: entryId, snapshot }, index) => ({
          id: entryId,
          track: isRecord(snapshot) ? { ...snapshot, ...formats[index] } : snapshot,
          available: formats[index] !== undefined,
        })),
      };
    })
  );

const sendPlaylists = async ({ database }: ListenerContext, sender: WebContents) => {
  const playlists = await withAvailability(database, await getPlaylists(database));
  // the window can be closed while the database answers
  if (!sender.isDestroyed()) sender.send('PLAYLISTS', { playlists });
};

const registerPlaylistListeners = (context: ListenerContext) => {
  const { database } = context;
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendPlaylists(context, sender)).catch((e) => console.error(e));

  ipcMain.on('PLAYLISTS_LOAD', (event) => {
    reply(event.sender, Promise.resolve());
  });

  ipcMain.on('PLAYLIST_CREATE', (event, payload: unknown) => {
    const { name, tracks } = isRecord(payload) ? payload : {};
    if (!toName(name)) return;

    reply(
      event.sender,
      createPlaylist(database, toName(name)).then((id) => addEntries(database, id, toTracks(tracks)))
    );
  });

  ipcMain.on('PLAYLIST_RENAME', (event, payload: unknown) => {
    const { id, name } = isRecord(payload) ? payload : {};
    if (!isId(id) || !toName(name)) return;

    reply(event.sender, renamePlaylist(database, id, toName(name)));
  });

  ipcMain.on('PLAYLIST_DELETE', (event, payload: unknown) => {
    const { id } = isRecord(payload) ? payload : {};
    if (!isId(id)) return;

    reply(event.sender, deletePlaylist(database, id));
  });

  ipcMain.on('PLAYLIST_MOVE', (event, payload: unknown) => {
    const { id, toIndex } = isRecord(payload) ? payload : {};
    if (!isId(id) || !isId(toIndex)) return;

    reply(event.sender, movePlaylist(database, id, toIndex));
  });

  ipcMain.on('PLAYLIST_ADD', (event, payload: unknown) => {
    const { id, tracks } = isRecord(payload) ? payload : {};
    if (!isId(id)) return;

    reply(event.sender, addEntries(database, id, toTracks(tracks)));
  });

  ipcMain.on('PLAYLIST_REMOVE_ENTRY', (event, payload: unknown) => {
    const { id, entryId } = isRecord(payload) ? payload : {};
    if (!isId(id) || !isId(entryId)) return;

    reply(event.sender, removeEntry(database, id, entryId));
  });

  ipcMain.on('PLAYLIST_MOVE_ENTRY', (event, payload: unknown) => {
    const { id, entryId, toIndex } = isRecord(payload) ? payload : {};
    if (!isId(id) || !isId(entryId) || !isId(toIndex)) return;

    reply(event.sender, moveEntry(database, id, entryId, toIndex));
  });
};

export default registerPlaylistListeners;
