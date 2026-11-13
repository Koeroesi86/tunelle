import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions, WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { ListenerContext } from './listener-context';
import { chooseArtistPhoto, readPhotoFile, removeArtistPhoto, resetArtistPhoto } from '../services/artist-photo-choice';
import { artistPhotoChangeSchema } from '@shared/schemas/requests';
import { getMainTranslator } from '../language';
import { getAlbumArtFolder } from '../utils/album-art-folder';
import { parsePayload } from '../utils/parse-payload';
import { logError } from '../utils/log-error';
import { sendIfAlive } from '../utils/send-if-alive';

const pickImage = async (sender: WebContents) => {
  const { t } = getMainTranslator();
  const options: OpenDialogOptions = {
    title: t('artistPhoto.dialog'),
    properties: ['openFile'],
    filters: [{ name: t('artistPhoto.filter'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  };
  const window = BrowserWindow.fromWebContents(sender);
  const { canceled, filePaths } = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options));
  return canceled ? undefined : filePaths[0];
};

const pick = async (database: Database, sender: WebContents, key: string) => {
  const filePath = await pickImage(sender);
  if (!filePath) return false;

  const file = await readPhotoFile(filePath);
  if ('reason' in file) {
    sendIfAlive(sender, 'ARTIST_PHOTO_FAILED', { reason: file.reason });
    return false;
  }

  await chooseArtistPhoto(database, getAlbumArtFolder(global._appDataPath), key, file.image);
  return true;
};

/** Choosing, removing and resetting the photo of an artist; it works with the lookup of the photos turned off, as a file on this computer is sent nowhere */
const registerArtistPhotoChoiceListeners = ({ database }: ListenerContext) => {
  ipcMain.on('ARTIST_PHOTO_CHANGE', (event, payload: unknown) => {
    const request = parsePayload(artistPhotoChangeSchema, payload);
    if (!request) return;

    const { key, change } = request;
    const folder = getAlbumArtFolder(global._appDataPath);
    const changes = {
      pick: () => pick(database, event.sender, key),
      remove: () => removeArtistPhoto(database, folder, key).then(() => true),
      reset: () => resetArtistPhoto(database, folder, key).then(() => true),
    };

    changes[change]()
      .then((changed) => changed && sendIfAlive(event.sender, 'ARTIST_PHOTOS_READY', {}))
      .catch(logError);
  });
};

export default registerArtistPhotoChoiceListeners;
