import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions, WebContents } from 'electron';
import type { ListenerContext } from './listener-context';
import { addEntries, createPlaylist, deletePlaylist, moveEntry, movePlaylist, removeEntry, renamePlaylist } from '../repositories/playlist-repository';
import { sendPlaylists } from '../library/playlists/send-playlists';
import { importPlaylistFiles } from '../library/playlists/import-playlist-files';
import { playlistExtensions } from '../library/playlists/playlist-files';
import { getMainTranslator } from '../language';
import {
  playlistAddSchema,
  playlistCreateSchema,
  playlistEntrySchema,
  playlistIdSchema,
  playlistMoveEntrySchema,
  playlistMoveSchema,
  playlistRenameSchema,
} from '@shared/schemas/playlists';
import { parsePayload } from '../utils/parse-payload';
import { logError } from '../utils/log-error';
import { sendIfAlive } from '../utils/send-if-alive';

const registerPlaylistListeners = (context: ListenerContext) => {
  const { database } = context;
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendPlaylists(database, sender)).catch(logError);

  ipcMain.on('PLAYLISTS_LOAD', (event) => {
    reply(event.sender, Promise.resolve());
  });

  ipcMain.on('PLAYLIST_IMPORT', (event) => {
    const { t } = getMainTranslator();
    const options: OpenDialogOptions = {
      title: t('playlists.importPick'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: t('playlists.importFilter'), extensions: playlistExtensions }],
    };
    const window = BrowserWindow.fromWebContents(event.sender);

    (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
      .then(({ canceled, filePaths }) => (canceled ? undefined : importPlaylistFiles(database, filePaths)))
      .then(async (reports) => {
        if (!reports) return;
        await sendPlaylists(database, event.sender);
        sendIfAlive(event.sender, 'PLAYLIST_IMPORT_REPORT', { reports });
      })
      .catch(logError);
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
