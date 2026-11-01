import { ipcMain, shell } from 'electron';
import type { ListenerContext } from './listenerContext';

const isEnabledRequest = (payload: unknown): payload is { enabled: boolean } =>
  typeof payload === 'object' && payload !== null && 'enabled' in payload && typeof payload.enabled === 'boolean';

const releasesUrl = 'https://github.com/Koeroesi86/tunelle/releases';

/** The settings ask for the version and the update state, start a check and ask for the restart; the update source itself stays in this process */
const registerUpdateListeners = ({ updates }: ListenerContext) => {
  ipcMain.on('GET_APP_VERSION', (event) => {
    if (!event.sender.isDestroyed()) event.sender.send('UPDATE_STATE', updates.getState());
  });
  ipcMain.on('CHECK_FOR_UPDATES', () => {
    updates.check().catch((e) => console.error(e));
  });
  ipcMain.on('SET_AUTOMATIC_UPDATES', (_event, payload: unknown) => {
    if (!isEnabledRequest(payload)) return;

    updates.setAutomatic(payload.enabled).catch((e) => console.error(e));
  });
  // the renderer saved the settings just before, and the database closes after what it has queued
  ipcMain.on('INSTALL_UPDATE', () => updates.install());
  // a fixed address, the renderer does not choose what is opened
  ipcMain.on('OPEN_RELEASES', () => {
    shell.openExternal(releasesUrl).catch((e) => console.error(e));
  });
};

export default registerUpdateListeners;
