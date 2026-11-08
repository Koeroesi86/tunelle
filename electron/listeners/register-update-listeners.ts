import { ipcMain, shell } from 'electron';
import type { ListenerContext } from './listener-context';
import { sendIfAlive } from '../utils/send-if-alive';
import { enabledRequestSchema } from '@shared/schemas/requests';
import { parsePayload } from '../utils/parse-payload';
import { logError } from '../utils/log-error';

const releasesUrl = 'https://github.com/Koeroesi86/tunelle/releases';

/** The settings ask for the version and the update state, start a check and ask for the restart; the update source itself stays in this process */
const registerUpdateListeners = ({ updates }: ListenerContext) => {
  ipcMain.on('GET_APP_VERSION', (event) => {
    sendIfAlive(event.sender, 'UPDATE_STATE', updates.getState());
  });
  ipcMain.on('CHECK_FOR_UPDATES', () => {
    updates.check().catch(logError);
  });
  ipcMain.on('CONFIRM_METERED_UPDATE', () => {
    updates.confirmMetered().catch(logError);
  });
  ipcMain.on('CANCEL_METERED_UPDATE', () => updates.cancelMetered());
  ipcMain.on('SET_ALLOW_METERED_UPDATES', (_event, payload: unknown) => {
    const request = parsePayload(enabledRequestSchema, payload);
    if (!request) return;

    updates.setAllowMetered(request.enabled).catch(logError);
  });
  ipcMain.on('SET_AUTOMATIC_UPDATES', (_event, payload: unknown) => {
    const request = parsePayload(enabledRequestSchema, payload);
    if (!request) return;

    updates.setAutomatic(request.enabled).catch(logError);
  });
  // the renderer saved the settings just before, and the database closes after what it has queued
  ipcMain.on('INSTALL_UPDATE', () => updates.install());
  // a fixed address, the renderer does not choose what is opened
  ipcMain.on('OPEN_RELEASES', () => {
    shell.openExternal(releasesUrl).catch(logError);
  });
};

export default registerUpdateListeners;
