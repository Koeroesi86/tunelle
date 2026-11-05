import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ListenerContext } from './listenerContext';
import { addFavourite, getFavourites, removeFavourite } from './favouritesRepository';
import { withAvailability } from './favouriteAvailability';
import { isRecord } from '../shared/utils/is-record';
import { toKey } from './keyPayload';

const sendFavourites = async (context: ListenerContext, sender: WebContents) => {
  const favourites = await withAvailability(await getFavourites(context.database), context);
  // the window can be closed while the database and the station directory answer
  if (!sender.isDestroyed()) sender.send('FAVOURITES', { favourites });
};

const registerFavouriteListeners = (context: ListenerContext) => {
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendFavourites(context, sender)).catch((e) => console.error(e));

  ipcMain.on('FAVOURITES_LOAD', (event) => {
    reply(event.sender, Promise.resolve());
  });

  ipcMain.on('FAVOURITE_ADD', (event, payload: unknown) => {
    const key = toKey(payload);
    if (!key || !isRecord(payload) || !isRecord(payload.snapshot)) return;

    reply(event.sender, addFavourite(context.database, key, payload.snapshot));
  });

  ipcMain.on('FAVOURITE_REMOVE', (event, payload: unknown) => {
    const key = toKey(payload);
    if (!key) return;

    reply(event.sender, removeFavourite(context.database, key));
  });
};

export default registerFavouriteListeners;
