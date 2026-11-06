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
import {
  playlistAddSchema,
  playlistCreateSchema,
  playlistEntrySchema,
  playlistIdSchema,
  playlistMoveEntrySchema,
  playlistMoveSchema,
  playlistRenameSchema,
} from '@shared/schemas/playlists';
import { isRecord } from '@shared/utils/is-record';
import { parsePayload } from '../utils/parse-payload';
import { sendIfAlive } from '../utils/send-if-alive';
import { logError } from '../utils/log-error';

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
  sendIfAlive(sender, 'PLAYLISTS', { playlists });
};

const registerPlaylistListeners = (context: ListenerContext) => {
  const { database } = context;
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendPlaylists(context, sender)).catch(logError);

  ipcMain.on('PLAYLISTS_LOAD', (event) => {
    reply(event.sender, Promise.resolve());
  });

  ipcMain.on('PLAYLIST_CREATE', (event, payload: unknown) => {
    const parsed = parsePayload(playlistCreateSchema, payload);
    if (!parsed) return;

    reply(
      event.sender,
      createPlaylist(database, parsed.name).then((id) => addEntries(database, id, parsed.tracks))
    );
  });

  ipcMain.on('PLAYLIST_RENAME', (event, payload: unknown) => {
    const parsed = parsePayload(playlistRenameSchema, payload);
    if (!parsed) return;

    reply(event.sender, renamePlaylist(database, parsed.id, parsed.name));
  });

  ipcMain.on('PLAYLIST_DELETE', (event, payload: unknown) => {
    const parsed = parsePayload(playlistIdSchema, payload);
    if (!parsed) return;

    reply(event.sender, deletePlaylist(database, parsed.id));
  });

  ipcMain.on('PLAYLIST_MOVE', (event, payload: unknown) => {
    const parsed = parsePayload(playlistMoveSchema, payload);
    if (!parsed) return;

    reply(event.sender, movePlaylist(database, parsed.id, parsed.toIndex));
  });

  ipcMain.on('PLAYLIST_ADD', (event, payload: unknown) => {
    const parsed = parsePayload(playlistAddSchema, payload);
    if (!parsed) return;

    reply(event.sender, addEntries(database, parsed.id, parsed.tracks));
  });

  ipcMain.on('PLAYLIST_REMOVE_ENTRY', (event, payload: unknown) => {
    const parsed = parsePayload(playlistEntrySchema, payload);
    if (!parsed) return;

    reply(event.sender, removeEntry(database, parsed.id, parsed.entryId));
  });

  ipcMain.on('PLAYLIST_MOVE_ENTRY', (event, payload: unknown) => {
    const parsed = parsePayload(playlistMoveEntrySchema, payload);
    if (!parsed) return;

    reply(event.sender, moveEntry(database, parsed.id, parsed.entryId, parsed.toIndex));
  });
};

export default registerPlaylistListeners;
