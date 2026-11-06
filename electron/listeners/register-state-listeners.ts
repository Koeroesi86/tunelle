import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ListenerContext } from './listener-context';
import { getFolders } from '../repositories/library-repository';
import { getSettings, saveSettings } from '../repositories/settings-repository';
import { setPickedLanguage } from '../language';
import { applyThemeMode } from '../theme';
import { applyWatchSetting, startLibraryWatching } from '../library/watch/library-watching';
import { savedSettingsSchema } from '@shared/schemas/requests';
import { parsePayload } from '../utils/parse-payload';
import { sendIfAlive } from '../utils/send-if-alive';
import { logError } from '../utils/log-error';

const sendState = async ({ database }: ListenerContext, sender: WebContents) => {
  sendIfAlive(sender, 'STORE_FOLDERS', { folders: await getFolders(database) });

  const settings = await getSettings(database);
  if (settings) sendIfAlive(sender, 'RESTORE_SETTINGS', { settings });
};

const registerStateListeners = (context: ListenerContext) => {
  ipcMain.on('APP_READY', (event) => {
    sendState(context, event.sender).catch(logError);
    startLibraryWatching(context.database, event.sender).catch(logError);
  });

  ipcMain.on('SAVE_SETTINGS', (event, payload: unknown) => {
    const settings = parsePayload(savedSettingsSchema, payload);
    if (!settings) return;

    setPickedLanguage(settings);
    applyThemeMode(settings);
    applyWatchSetting(settings).catch(logError);
    saveSettings(context.database, settings)
      .then(() => sendIfAlive(event.sender, 'SETTINGS_SAVED', { settings }))
      .catch(logError);
  });
};

export default registerStateListeners;
