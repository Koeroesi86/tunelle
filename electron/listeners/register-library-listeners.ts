import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import type { ListenerContext } from './listener-context';
import addFoldersToLibrary from '../library/scan/add-folders-to-library';
import removeFolderFromLibrary from '../library/scan/remove-folder-from-library';
import rescanLibrary from '../library/scan/rescan-library';
import openLibraryPath from '../utils/open-library-path';
import checkFolders from '../library/scan/check-folders';
import pickFolders from '../utils/pick-folders';
import { getMainTranslator } from '../language';
import { rescanRequestSchema } from '@shared/schemas/requests';
import { logError } from '../utils/log-error';

const registerLibraryListeners = ({ database }: ListenerContext) => {
  ipcMain.on('ADD_FOLDERS_TO_LIBRARY', (event, files: unknown) => {
    addFoldersToLibrary(database, files, event.sender).catch(logError);
  });

  ipcMain.on('REMOVE_FOLDER_FROM_LIBRARY', (event, target: unknown) => {
    removeFolderFromLibrary(database, target, event.sender).catch(logError);
  });

  ipcMain.on('RESCAN_LIBRARY', (event, payload: unknown) => {
    rescanLibrary(event.sender, rescanRequestSchema.parse(payload));
  });

  ipcMain.on('CHECK_FOLDERS', (event) => {
    checkFolders(database, event.sender).catch(logError);
  });

  ipcMain.on('PICK_FOLDERS', (event) => {
    const options: OpenDialogOptions = { title: getMainTranslator().t('folders.pick'), properties: ['openDirectory', 'multiSelections'] };
    const window = BrowserWindow.fromWebContents(event.sender);
    pickFolders(database, event.sender, () => (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))).catch(logError);
  });

  ipcMain.on('OPEN_LIBRARY_PATH', (_event, target: unknown) => {
    openLibraryPath(database, target, (folder) => shell.openPath(folder)).catch(logError);
  });
};

export default registerLibraryListeners;
