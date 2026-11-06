import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ListenerContext } from './listener-context';
import { addFavourite, getFavourites, removeFavourite } from '../repositories/favourites-repository';
import { withAvailability } from '../library/watch/favourite-availability';
import { favouriteKeySchema, snapshotPayloadSchema } from '@shared/schemas/favourites';
import { parsePayload } from '../utils/parse-payload';
import { sendIfAlive } from '../utils/send-if-alive';
import { logError } from '../utils/log-error';

const sendFavourites = async (context: ListenerContext, sender: WebContents) => {
  const favourites = await withAvailability(await getFavourites(context.database), context);
  sendIfAlive(sender, 'FAVOURITES', { favourites });
};

const registerFavouriteListeners = (context: ListenerContext) => {
  const reply = (sender: WebContents, work: Promise<unknown>) => work.then(() => sendFavourites(context, sender)).catch(logError);

  ipcMain.on('FAVOURITES_LOAD', (event) => {
    reply(event.sender, Promise.resolve());
  });

  ipcMain.on('FAVOURITE_ADD', (event, payload: unknown) => {
    const parsed = parsePayload(snapshotPayloadSchema, payload);
    if (!parsed) return;

    const { snapshot, ...key } = parsed;
    reply(event.sender, addFavourite(context.database, key, snapshot));
  });

  ipcMain.on('FAVOURITE_REMOVE', (event, payload: unknown) => {
    const key = parsePayload(favouriteKeySchema, payload);
    if (!key) return;

    reply(event.sender, removeFavourite(context.database, key));
  });
};

export default registerFavouriteListeners;
