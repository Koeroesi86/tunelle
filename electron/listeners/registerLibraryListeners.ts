import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import type { ListenerContext } from './listenerContext';
import addFoldersToLibrary from '../addFoldersToLibrary';
import removeFolderFromLibrary from '../removeFolderFromLibrary';
import rescanLibrary from '../rescanLibrary';
import openLibraryPath from '../openLibraryPath';
import checkFolders from '../checkFolders';
import pickFolders from '../pickFolders';
import { getMainTranslator } from '../language';

const isForced = (payload: unknown) => typeof payload === 'object' && payload !== null && 'forced' in payload && payload.forced === true;

const registerLibraryListeners = ({ database }: ListenerContext) => {
  ipcMain.on('ADD_FOLDERS_TO_LIBRARY', (event, files: unknown) => {
    addFoldersToLibrary(database, files, event.sender).catch((e) => console.error(e));
  });

  ipcMain.on('REMOVE_FOLDER_FROM_LIBRARY', (event, target: unknown) => {
    removeFolderFromLibrary(database, target, event.sender).catch((e) => console.error(e));
  });

  ipcMain.on('RESCAN_LIBRARY', (event, payload: unknown) => {
    rescanLibrary(event.sender, isForced(payload));
  });

  ipcMain.on('CHECK_FOLDERS', (event) => {
    checkFolders(database, event.sender).catch((e) => console.error(e));
  });

  ipcMain.on('PICK_FOLDERS', (event) => {
    const options: OpenDialogOptions = { title: getMainTranslator().t('folders.pick'), properties: ['openDirectory', 'multiSelections'] };
    const window = BrowserWindow.fromWebContents(event.sender);
    pickFolders(database, event.sender, () => (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))).catch((e) =>
      console.error(e)
    );
  });

  ipcMain.on('OPEN_LIBRARY_PATH', (_event, target: unknown) => {
    openLibraryPath(database, target, (folder) => shell.openPath(folder)).catch((e) => console.error(e));
  });
};

export default registerLibraryListeners;
