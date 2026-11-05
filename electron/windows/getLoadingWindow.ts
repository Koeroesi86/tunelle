import { BrowserWindow } from 'electron';
import { resolve } from 'path';

function getLoadingWindow() {
  const loadingWindow = new BrowserWindow({
    // x: 0,
    // y: 0,
    width: 400,
    height: 300,
    frame: false,
    center: true,
    resizable: false,
    transparent: true,
    darkTheme: true,
    show: false,
    icon: resolve(__dirname, '../../../icons/png/512x512.png'),
    webPreferences: {
      backgroundThrottling: false,
      preload: resolve(__dirname, '../splashPreload.js'),
    },
  });
  // loadingWindow.setSize(400, 300)
  loadingWindow.setResizable(false);
  loadingWindow.setMaximizable(false);
  loadingWindow.setFullScreenable(false);
  // loadingWindow.setClosable(false)
  loadingWindow.setVibrancy('under-window');

  return loadingWindow;
}

export default getLoadingWindow;
