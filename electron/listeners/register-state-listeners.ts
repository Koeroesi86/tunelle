import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ListenerContext } from './listener-context';
import { getFolders } from '../repositories/library-repository';
import { getSettings, saveSettings } from '../repositories/settings-repository';
import { setPickedLanguage } from '../language';
import { applyThemeMode } from '../theme';
import { applyWatchSetting, startLibraryWatching } from '../library/watch/library-watching';
import { applyPowerSetting } from '../power/power-state';
import { sendSoftwareRendering } from '../windows/gpu-acceleration';
import { sendPowerSaving } from '../power/send-power-saving';
import { savedSettingsSchema } from '@shared/schemas/requests';
import { parsePayload } from '../utils/parse-payload';
import { sendIfAlive } from '../utils/send-if-alive';
import { attachOpenedFiles } from '../library/opened/opened-files';
import { logError } from '../utils/log-error';

const sendState = async ({ database }: ListenerContext, sender: WebContents, unsaved: Record<string, unknown>) => {
  sendIfAlive(sender, 'STORE_FOLDERS', { folders: await getFolders(database) });

  const settings = { ...savedSettingsSchema.safeParse(await getSettings(database)).data, ...unsaved };
  if (Object.keys(settings).length > 0) sendIfAlive(sender, 'RESTORE_SETTINGS', { settings });
};

const registerStateListeners = (context: ListenerContext) => {
  // what the page changed of the queue since it started: a page that is loaded again after a crash saved none of it. See docs/app/system-events.md
  const playback: Record<string, unknown> = {};

  ipcMain.on('PLAYBACK_SNAPSHOT', (_, payload: unknown) => {
    Object.assign(playback, parsePayload(savedSettingsSchema, payload));
  });

  ipcMain.on('APP_READY', (event) => {
    // the opened files follow the saved settings, as the saved queue would replace them
    sendState(context, event.sender, playback)
      .finally(() => attachOpenedFiles(event.sender))
      .catch(logError);
    sendPowerSaving(event.sender);
    sendSoftwareRendering(event.sender);
    startLibraryWatching(context.database, event.sender).catch(logError);
  });

  ipcMain.on('SAVE_SETTINGS', (event, payload: unknown) => {
    const settings = parsePayload(savedSettingsSchema, payload);
    if (!settings) return;

    setPickedLanguage(settings);
    applyThemeMode(settings);
    applyPowerSetting(settings);
    applyWatchSetting(settings).catch(logError);
    saveSettings(context.database, settings)
      .then(() => context.loudness.checkSetting())
      .then(() => sendIfAlive(event.sender, 'SETTINGS_SAVED', { settings }))
      .catch(logError);
  });
};

export default registerStateListeners;
