import { isFlagSet } from '../schemas/environment';
import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ListenerContext } from './listener-context';
import { createArtistPhotoQueue } from '../services/artist-photos';
import { artistNamesSchema } from '@shared/schemas/requests';
import { sendIfAlive } from '../utils/send-if-alive';
import { logError } from '../utils/log-error';
import { getAlbumArtFolder } from '../utils/album-art-folder';

/** Turned off by TUNELLE_NO_ARTIST_PHOTOS=1, which the smoke tests set so they do not reach Deezer */
const registerArtistPhotoListeners = ({ database }: ListenerContext, env: NodeJS.ProcessEnv = process.env) => {
  if (isFlagSet(env.TUNELLE_NO_ARTIST_PHOTOS)) return;

  let requester: WebContents | undefined;
  const queue = createArtistPhotoQueue({
    database,
    getFolder: () => getAlbumArtFolder(global._appDataPath),
    onFound: () => {
      if (requester) sendIfAlive(requester, 'ARTIST_PHOTOS_READY', {});
    },
  });

  ipcMain.on('ARTIST_PHOTOS_WANTED', (event, payload: unknown) => {
    requester = event.sender;
    queue.enqueue(artistNamesSchema.parse(payload)).catch(logError);
  });
};

export default registerArtistPhotoListeners;
