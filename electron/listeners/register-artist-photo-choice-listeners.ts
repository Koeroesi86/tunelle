import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions, WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { ListenerContext } from './listener-context';
import { chooseArtistPhoto, readPhotoFile, removeArtistPhoto, resetArtistPhoto } from '../services/artist-photo-choice';
import { getImage, searchArtistPhotos } from '../services/artist-photos';
import { artistPhotoChangeSchema, artistPhotoSearchSchema } from '@shared/schemas/requests';
import type { ArtistPhotoChange } from '@shared/types/artist-photo';
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

const download = async (database: Database, sender: WebContents, key: string, picture: string) => {
  const image = await getImage(picture).catch(() => undefined);
  if (!image) {
    sendIfAlive(sender, 'ARTIST_PHOTO_FAILED', { reason: 'downloadFailed' });
    return false;
  }

  await chooseArtistPhoto(database, getAlbumArtFolder(global._appDataPath), key, image);
  return true;
};

const apply = (database: Database, sender: WebContents, request: ArtistPhotoChange) => {
  const folder = getAlbumArtFolder(global._appDataPath);
  if (request.change === 'download') return download(database, sender, request.key, request.picture);
  if (request.change === 'pick') return pick(database, sender, request.key);
  if (request.change === 'remove') return removeArtistPhoto(database, folder, request.key).then(() => true);
  return resetArtistPhoto(database, folder, request.key).then(() => true);
};

/** Choosing, removing, resetting and searching the photo of an artist; it works with the lookup of the photos turned off, as a file on this computer is sent nowhere */
const registerArtistPhotoChoiceListeners = ({ database }: ListenerContext) => {
  ipcMain.on('ARTIST_PHOTO_CHANGE', (event, payload: unknown) => {
    const request = parsePayload(artistPhotoChangeSchema, payload);
    if (!request) return;

    apply(database, event.sender, request)
      .then((changed) => changed && sendIfAlive(event.sender, 'ARTIST_PHOTOS_READY', {}))
      .catch(logError);
  });

  ipcMain.on('ARTIST_PHOTO_SEARCH', (event, payload: unknown) => {
    const request = parsePayload(artistPhotoSearchSchema, payload);
    if (!request) return;

    searchArtistPhotos(request.query)
      .then((candidates) => sendIfAlive(event.sender, 'ARTIST_PHOTO_CANDIDATES', { query: request.query, candidates }))
      .catch((error) => {
        logError(error);
        sendIfAlive(event.sender, 'ARTIST_PHOTO_FAILED', { reason: 'searchFailed' });
      });
  });
};

export default registerArtistPhotoChoiceListeners;
