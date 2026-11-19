import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions, SaveDialogOptions, WebContents } from 'electron';
import type { ListenerContext } from './listener-context';
import {
  addEntries,
  createPlaylist,
  deletePlaylist,
  getImportedPlaylists,
  getPlaylists,
  moveEntry,
  movePlaylist,
  removeEntry,
  renamePlaylist,
  setEncodingOverride,
  setPlaylistSync,
  undoImport,
} from '../repositories/playlist-repository';
import { sendPlaylists } from '../library/playlists/send-playlists';
import { exportPlaylist, writeBackPlaylist } from '../library/playlists/export-playlist';
import { retirePlaylistFile } from '../library/playlists/write-playlist-file';
import { handleWriteFailure } from '../library/playlists/handle-write-failure';
import { importPlaylistFiles, reimportPlaylistFile } from '../library/playlists/import-playlist-files';
import { playlistExportFilters, playlistExtensions } from '../library/playlists/playlist-files';
import { getMainTranslator } from '../language';
import {
  playlistAddSchema,
  playlistCreateSchema,
  playlistDeleteSchema,
  playlistEncodingSchema,
  playlistEntrySchema,
  playlistIdSchema,
  playlistMoveEntrySchema,
  playlistMoveSchema,
  playlistRenameSchema,
  playlistSyncSchema,
} from '@shared/schemas/playlists';
import { parsePayload } from '../utils/parse-payload';
import { logError } from '../utils/log-error';
import { sendIfAlive } from '../utils/send-if-alive';

const noteAbsolutePaths = (window: BrowserWindow | null, count: number) => {
  const { t } = getMainTranslator();
  const options = { type: 'info' as const, message: t('playlists.exportDriveNote', { count }), buttons: [t('playlists.exportDriveOk')] };
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
};

const registerPlaylistListeners = (context: ListenerContext) => {
  const { database } = context;
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendPlaylists(database, sender)).catch(logError);
  /** A change of a playlist that is kept in sync with its file is written to the file; a failed write is logged and does not undo the change */
  const writeBack = (sender: WebContents, id: number) =>
    writeBackPlaylist(database, id).catch((error: unknown) => handleWriteFailure(database, BrowserWindow.fromWebContents(sender), id, error));
  const replyAndWrite = (sender: WebContents, id: number, work: Promise<unknown>) =>
    reply(
      sender,
      work.then(() => writeBack(sender, id))
    );

  /** The file that the playlist was read from goes (kept as `<file>.bak`); a file that cannot be removed leaves the playlist as it is. See docs/app/playlist-import.md */
  const removeFile = (id: number, deleteFile: boolean) =>
    deleteFile
      ? getImportedPlaylists(database).then((playlists) =>
          Promise.all(playlists.filter((playlist) => playlist.id === id).map(({ sourcePath }) => retirePlaylistFile(sourcePath)))
        )
      : Promise.resolve([]);

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

  ipcMain.on('PLAYLIST_EXPORT', (event, payload: unknown) => {
    const parsed = parsePayload(playlistIdSchema, payload);
    if (!parsed) return;

    const { t } = getMainTranslator();
    const options: SaveDialogOptions = {
      title: t('playlists.exportPick'),
      filters: playlistExportFilters.map(({ key, extensions }) => ({ name: t(key), extensions })),
    };
    const window = BrowserWindow.fromWebContents(event.sender);

    getPlaylists(database)
      .then((playlists) => ({ ...options, defaultPath: `${playlists.find(({ id }) => id === parsed.id)?.name ?? 'playlist'}.m3u8` }))
      .then((withName) => (window ? dialog.showSaveDialog(window, withName) : dialog.showSaveDialog(withName)))
      .then(({ canceled, filePath }) => (canceled || !filePath ? undefined : exportPlaylist(database, parsed.id, filePath)))
      .then((exported) => (exported?.onAnotherDrive ? noteAbsolutePaths(window, exported.onAnotherDrive) : undefined))
      .catch((error: unknown) => handleWriteFailure(database, window, parsed.id, error));
  });

  ipcMain.on('PLAYLIST_SYNC', (event, payload: unknown) => {
    const parsed = parsePayload(playlistSyncSchema, payload);
    if (!parsed) return;

    reply(
      event.sender,
      setPlaylistSync(database, parsed.id, parsed.sync).then(() => (parsed.sync ? writeBack(event.sender, parsed.id) : undefined))
    );
  });

  ipcMain.on('PLAYLIST_ENCODING', (event, payload: unknown) => {
    const parsed = parsePayload(playlistEncodingSchema, payload);
    if (!parsed) return;

    // the file is read again with the encoding that was chosen, the one it is read with from now on
    reply(
      event.sender,
      setEncodingOverride(database, parsed.id, parsed.encoding).then(() => reimportPlaylistFile(database, parsed.id))
    );
  });

  ipcMain.on('PLAYLIST_UNDO_IMPORT', (event, payload: unknown) => {
    const parsed = parsePayload(playlistIdSchema, payload);
    if (!parsed) return;

    // the file keeps what it says until the change is written to it, with the sync on
    replyAndWrite(event.sender, parsed.id, undoImport(database, parsed.id));
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

    replyAndWrite(event.sender, parsed.id, renamePlaylist(database, parsed.id, parsed.name));
  });

  ipcMain.on('PLAYLIST_DELETE', (event, payload: unknown) => {
    const parsed = parsePayload(playlistDeleteSchema, payload);
    if (!parsed) return;

    reply(
      event.sender,
      removeFile(parsed.id, parsed.deleteFile).then(() => deletePlaylist(database, parsed.id))
    );
  });

  ipcMain.on('PLAYLIST_MOVE', (event, payload: unknown) => {
    const parsed = parsePayload(playlistMoveSchema, payload);
    if (!parsed) return;

    reply(event.sender, movePlaylist(database, parsed.id, parsed.toIndex));
  });

  ipcMain.on('PLAYLIST_ADD', (event, payload: unknown) => {
    const parsed = parsePayload(playlistAddSchema, payload);
    if (!parsed) return;

    replyAndWrite(event.sender, parsed.id, addEntries(database, parsed.id, parsed.tracks));
  });

  ipcMain.on('PLAYLIST_REMOVE_ENTRY', (event, payload: unknown) => {
    const parsed = parsePayload(playlistEntrySchema, payload);
    if (!parsed) return;

    replyAndWrite(event.sender, parsed.id, removeEntry(database, parsed.id, parsed.entryId));
  });

  ipcMain.on('PLAYLIST_MOVE_ENTRY', (event, payload: unknown) => {
    const parsed = parsePayload(playlistMoveEntrySchema, payload);
    if (!parsed) return;

    replyAndWrite(event.sender, parsed.id, moveEntry(database, parsed.id, parsed.entryId, parsed.toIndex));
  });
};

export default registerPlaylistListeners;
