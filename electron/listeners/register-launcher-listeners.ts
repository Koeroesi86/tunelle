import { app, ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { join, resolve } from 'path';
import {
  disableLauncher,
  enableLauncher,
  hasOtherLauncher,
  isLauncherEnabled,
  markLauncherOffered,
  syncLauncher,
  wasLauncherOffered,
} from '../services/app-image-launcher';
import type { LauncherOptions } from '../services/app-image-launcher';
import { logError } from '../utils/log-error';

// the menu entry is only offered from an AppImage, it has no install step of its own
const findAppImage = () => (process.platform === 'linux' ? process.env.APPIMAGE : undefined);

const getOptions = (): LauncherOptions => ({
  dataHome: process.env.XDG_DATA_HOME || join(app.getPath('home'), '.local/share'),
  iconsPath: resolve(__dirname, '../../../icons/png'),
});

// an entry of another tool for this AppImage is no reason to add a second one, unless the app added its own before
const sendState = (sender: WebContents, appImage: string) =>
  Promise.all([isLauncherEnabled(getOptions().dataHome), wasLauncherOffered(app.getPath('userData')), hasOtherLauncher(appImage, getOptions())]).then(
    ([enabled, offered, other]) => sender.send('LAUNCHER_STATE', { available: true, enabled, offered, external: other && !enabled })
  );

const isEnabledRequest = (payload: unknown): payload is { enabled: boolean } =>
  typeof payload === 'object' && payload !== null && 'enabled' in payload && typeof payload.enabled === 'boolean';

const registerLauncherListeners = (_context?: unknown, appImage = findAppImage()) => {
  if (!appImage) return;

  syncLauncher(appImage, getOptions()).catch(logError);

  ipcMain.on('APP_READY', (event) => {
    sendState(event.sender, appImage).catch(logError);
  });

  // an answer to the offer on the first run and the toggle in the settings are the same request, either way the user was asked
  ipcMain.on('SET_LAUNCHER', (event, payload: unknown) => {
    if (!isEnabledRequest(payload)) return;

    const change = () => (payload.enabled ? enableLauncher(appImage, getOptions()) : disableLauncher(getOptions()));

    // the other tool's entry stays the only one; turning the app's own off is always possible
    (payload.enabled ? hasOtherLauncher(appImage, getOptions()) : Promise.resolve(false))
      .then((other) => (other ? undefined : change()))
      .catch(logError)
      .then(() => markLauncherOffered(app.getPath('userData')))
      .then(() => sendState(event.sender, appImage))
      .catch(logError);
  });
};

export default registerLauncherListeners;
