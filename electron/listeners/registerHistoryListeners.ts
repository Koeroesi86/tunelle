import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ListenerContext } from './listenerContext';
import { clearHistory, getHistory, recordPlayed } from '../repositories/historyRepository';
import { withAvailability } from '../library/watch/favouriteAvailability';
import { isRecord } from '@shared/utils/is-record';
import { toKey } from '../utils/keyPayload';

const sendHistory = async (context: ListenerContext, sender: WebContents) => {
  const history = await withAvailability(await getHistory(context.database), context);
  // the window can be closed while the database and the station directory answer
  if (!sender.isDestroyed()) sender.send('HISTORY', { history });
};

const registerHistoryListeners = (context: ListenerContext) => {
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendHistory(context, sender)).catch((e) => console.error(e));

  ipcMain.on('HISTORY_LOAD', (event) => {
    reply(event.sender, Promise.resolve());
  });

  ipcMain.on('HISTORY_RECORD', (event, payload: unknown) => {
    const key = toKey(payload);
    if (!key || !isRecord(payload) || !isRecord(payload.snapshot)) return;

    reply(event.sender, recordPlayed(context.database, key, payload.snapshot));
  });

  ipcMain.on('HISTORY_CLEAR', (event) => {
    reply(event.sender, clearHistory(context.database));
  });
};

export default registerHistoryListeners;
