import { BrowserWindow } from 'electron';
import { resolve } from 'path';
import windowStateKeeper from 'electron-window-state';
import lockNavigation from './lockNavigation';
import { isDarkTheme } from '../theme';
import { applyWindowBackdrop, getBackdropArguments, getWindowBackdrop } from './windowBackdrop';

const createWindow = () => {
  const backdrop = getWindowBackdrop(process.platform);
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
    maximize: false,
  });
  const mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    frame: false,
    transparent: true,
    // the mode is on the native theme before the window opens (index.ts), so the first paint has the right theme; the window is transparent, so it has no background of its own
    darkTheme: isDarkTheme(),
    show: false,
    icon: resolve(__dirname, '../../../icons/png/512x512.png'),
    webPreferences: {
      backgroundThrottling: false,
      preload: resolve(__dirname, '../preload.js'),
      additionalArguments: getBackdropArguments(backdrop),
    },
  });
  applyWindowBackdrop(mainWindow, backdrop);
  mainWindowState.manage(mainWindow);
  lockNavigation(mainWindow.webContents);
  mainWindow.setFullScreenable(false);

  return mainWindow;
};

export default createWindow;
