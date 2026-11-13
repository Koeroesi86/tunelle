import { ipcMain, nativeImage } from 'electron';
import type { BrowserWindow } from 'electron';
import { resolve } from 'path';
import { getMainWindow } from '../windows/get-main-window';
import type { ListenerContext } from './listener-context';
import { getMainTranslator, onLanguageChange } from '../language';

const isWin = process.platform === 'win32';

const playbackButton = (main: BrowserWindow, tooltip: string, icon: string, isPlaying: boolean) => ({
  tooltip,
  icon: nativeImage.createFromPath(resolve(__dirname, `../../../assets/${icon}`)),
  click: () => main.webContents.send('SET_PLAYING', { isPlaying }),
});

const setPlaybackButtons = (main: BrowserWindow) => {
  const { t } = getMainTranslator();
  main.setThumbarButtons([playbackButton(main, t('player.play'), 'icons_play.png', true), playbackButton(main, t('player.pause'), 'icons_pause.png', false)]);
};

const listenForMaximize = (main: BrowserWindow) => {
  // main.isMaximized() is not working
  let isMaximized = false;
  const setMaximized = (maximized: boolean) => {
    isMaximized = maximized;
    main.webContents.send('MAXIMIZED_APP', { maximized });
  };

  main.on('maximize', () => setMaximized(true));
  main.on('unmaximize', () => setMaximized(false));
  ipcMain.on('MAXIMIZE_APP', () => (isMaximized ? main.unmaximize() : main.maximize()));
};

const focusMainWindow = (main: BrowserWindow) => {
  main.setAlwaysOnTop(true);
  main.show();
  main.focus();
  main.setAlwaysOnTop(false);
};

const registerWindowListeners = ({ windows }: ListenerContext) => {
  const main = () => getMainWindow(windows);

  ipcMain.on('CLOSE_APP', () => main().close());
  ipcMain.on('MINIMIZE_APP', () => main().minimize());
  ipcMain.on('NOTIFICATION_CLICKED', () => focusMainWindow(main()));
  listenForMaximize(main());
  if (!isWin) return;

  setPlaybackButtons(main());
  onLanguageChange(() => setPlaybackButtons(main()));
};

export default registerWindowListeners;
