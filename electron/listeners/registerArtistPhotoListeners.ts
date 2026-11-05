import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import path from 'path';
import type { ListenerContext } from './listenerContext';
import { createArtistPhotoQueue } from '../services/artistPhotos';
import type { ArtistName } from '../services/artistPhotos';

/** The most names one request holds, a page of a list is a hundred */
const maxNames = 200;

const isArtistName = (value: unknown): value is ArtistName =>
  typeof value === 'object' && value !== null && 'key' in value && typeof value.key === 'string' && 'name' in value && typeof value.name === 'string';

const namesOf = (payload: unknown) =>
  typeof payload === 'object' && payload !== null && 'artists' in payload && Array.isArray(payload.artists)
    ? payload.artists.filter(isArtistName).slice(0, maxNames)
    : [];

/** Turned off by TUNELLE_NO_ARTIST_PHOTOS=1, which the smoke tests set so they do not reach Deezer */
const registerArtistPhotoListeners = ({ database }: ListenerContext, env: NodeJS.ProcessEnv = process.env) => {
  if (env.TUNELLE_NO_ARTIST_PHOTOS === '1') return;

  let requester: WebContents | undefined;
  const queue = createArtistPhotoQueue({
    database,
    getFolder: () => path.join(global._appDataPath, './albumart/'),
    onFound: () => {
      if (requester && !requester.isDestroyed()) requester.send('ARTIST_PHOTOS_READY', {});
    },
  });

  ipcMain.on('ARTIST_PHOTOS_WANTED', (event, payload: unknown) => {
    requester = event.sender;
    queue.enqueue(namesOf(payload)).catch((e) => console.error(e));
  });
};

export default registerArtistPhotoListeners;
