import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { sendIfAlive } from '../utils/send-if-alive';

/**
 * Tells the page that the app has started (the database is open and the listeners answer), which is when it mounts the player under the splash.
 * The page asks too, as it may load after the message was sent. See docs/app/startup.md
 */
export const createStartupSignal = (window: BrowserWindow) => {
  let started = false;
  const send = () => sendIfAlive(window.webContents, 'APP_STARTED');

  ipcMain.on('STARTUP_STATUS', (event) => {
    if (started && event.sender === window.webContents) send();
  });

  return {
    start: () => {
      started = true;
      send();
    },
  };
};
