import { BrowserWindow } from 'electron';
import { resolve } from 'path';
import windowStateKeeper from 'electron-window-state';
import lockNavigation from './lock-navigation';
import registerWindowZoom from './window-zoom';
import { correctWindowBounds, minWindowSize } from './window-bounds';
import { isDarkTheme } from '../theme';
import { applyWindowBackdrop, getBackdropArguments, getWindowBackdrop, getWindowBackground, isWindowTransparent } from './window-backdrop';

const createWindow = () => {
  const backdrop = getWindowBackdrop(process.platform);
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
    maximize: false,
  });
  const mainWindow = new BrowserWindow({
    ...correctWindowBounds(mainWindowState),
    minWidth: minWindowSize.width,
    minHeight: minWindowSize.height,
    frame: false,
    transparent: isWindowTransparent(process.platform),
    // the material of Windows 11 shows through a clear background, Windows 10 gets the solid one of the theme (the page tint is translucent); See docs/app/window-snap.md
    ...getWindowBackground(backdrop, process.platform),
    // the mode is on the native theme before the window opens (index.ts), so the first paint has the right theme; the window is transparent, so it has no background of its own
    darkTheme: isDarkTheme(),
    show: false,
    icon: resolve(__dirname, '../../../icons/png/512x512.png'),
    webPreferences: {
      backgroundThrottling: false,
      preload: resolve(__dirname, '../preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      disableBlinkFeatures: 'Auxclick',
      additionalArguments: getBackdropArguments(backdrop, process.platform),
    },
  });
  applyWindowBackdrop(mainWindow, backdrop);
  mainWindowState.manage(mainWindow);
  lockNavigation(mainWindow.webContents);
  registerWindowZoom(mainWindow.webContents);
  mainWindow.setFullScreenable(false);

  return mainWindow;
};

export default createWindow;
