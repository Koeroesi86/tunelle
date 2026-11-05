import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ListenerContext } from './listener-context';
import { clearHistory, getHistory, recordPlayed } from '../repositories/history-repository';
import { withAvailability } from '../library/watch/favourite-availability';
import { isRecord } from '@shared/utils/is-record';
import { toKey } from '../utils/key-payload';
import { sendIfAlive } from '../utils/send-if-alive';
import { logError } from '../utils/log-error';

const sendHistory = async (context: ListenerContext, sender: WebContents) => {
  const history = await withAvailability(await getHistory(context.database), context);
  sendIfAlive(sender, 'HISTORY', { history });
};

const registerHistoryListeners = (context: ListenerContext) => {
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendHistory(context, sender)).catch(logError);

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
