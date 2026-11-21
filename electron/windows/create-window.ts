import { BrowserWindow } from 'electron';
import { resolve } from 'path';
import windowStateKeeper from 'electron-window-state';
import lockNavigation from './lock-navigation';
import registerWindowZoom from './window-zoom';
import { correctWindowBounds, minWindowSize } from './window-bounds';
import { isDarkTheme } from '../theme';
import { hasGpuAcceleration } from './gpu-acceleration';
import { applyWindowBackdrop, getBackdropArguments, getWindowBackdrop } from './window-backdrop';

const createWindow = () => {
  const accelerated = hasGpuAcceleration();
  // a window that is drawn by the CPU gets no translucency and no blur behind it: both are work for the compositor (see docs/app/software-rendering.md)
  const backdrop = accelerated ? getWindowBackdrop(process.platform) : 'none';
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
    transparent: accelerated,
    // the mode is on the native theme before the window opens (index.ts), so the first paint has the right theme; a transparent window has no background of its own
    darkTheme: isDarkTheme(),
    ...(accelerated ? {} : { backgroundColor: isDarkTheme() ? '#1f1f1f' : '#f2f2f2' }),
    show: false,
    icon: resolve(__dirname, '../../../icons/png/512x512.png'),
    webPreferences: {
      backgroundThrottling: false,
      preload: resolve(__dirname, '../preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      disableBlinkFeatures: 'Auxclick',
      additionalArguments: getBackdropArguments(backdrop, accelerated),
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
