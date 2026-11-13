import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { ListenerContext } from './listener-context';
import { albumCoverChangeSchema, albumCoverSearchSchema } from '@shared/schemas/requests';
import type { AlbumCoverChange } from '@shared/types/album-cover';
import { chooseAlbumCover, removeAlbumCover, resetAlbumCover } from '../services/album-cover-choice';
import { getImage } from '../services/artist-photos';
import { readPhotoFile } from '../services/artist-photo-choice';
import { queueAlbumArtAccents } from '../library/art/album-art-accents';
import { getMainTranslator } from '../language';
import { getAlbumArtFolder } from '../utils/album-art-folder';
import { logError } from '../utils/log-error';
import { parsePayload } from '../utils/parse-payload';
import { pickImage } from '../utils/pick-image';
import { sendIfAlive } from '../utils/send-if-alive';

/** The cover after a change, or undefined when nothing changed (the dialog was cancelled, or the file cannot be used) */
const pick = async (database: Database, sender: WebContents, { path, title }: AlbumCoverChange) => {
  const { t } = getMainTranslator();
  const filePath = await pickImage(sender, t('albumCover.dialog'), t('albumCover.filter'));
  if (!filePath) return undefined;

  const file = await readPhotoFile(filePath);
  if ('reason' in file) {
    sendIfAlive(sender, 'ALBUM_COVER_FAILED', { reason: file.reason });
    return undefined;
  }

  return chooseAlbumCover(database, getAlbumArtFolder(global._appDataPath), path, title, file.image);
};

const download = async (database: Database, sender: WebContents, { path, title }: AlbumCoverChange, picture: string) => {
  const image = await getImage(picture.replace(/front-250$/, 'front-500')).catch(() => undefined);
  if (!image) {
    sendIfAlive(sender, 'ALBUM_COVER_FAILED', { reason: 'downloadFailed' });
    return undefined;
  }

  return chooseAlbumCover(database, getAlbumArtFolder(global._appDataPath), path, title, image);
};

const apply = (database: Database, sender: WebContents, request: AlbumCoverChange) => {
  const folder = getAlbumArtFolder(global._appDataPath);
  if (request.change === 'download') return download(database, sender, request, request.picture);
  if (request.change === 'pick') return pick(database, sender, request);
  if (request.change === 'remove') return removeAlbumCover(database, folder, request.path, request.title);
  return resetAlbumCover(database, folder, request.path, request.title);
};

/** Choosing, removing, resetting and searching the cover of an album; a file on this computer is sent nowhere, the text of a search goes to MusicBrainz (the one the user typed, when they press Search) */
const registerAlbumCoverListeners = ({ database, radioArt }: ListenerContext) => {
  ipcMain.on('ALBUM_COVER_CHANGE', (event, payload: unknown) => {
    const request = parsePayload(albumCoverChangeSchema, payload);
    if (!request) return;

    apply(database, event.sender, request)
      .then((cover) => {
        if (cover === undefined) return;
        queueAlbumArtAccents(database);
        sendIfAlive(event.sender, 'ALBUM_COVER_CHANGED', { path: request.path, title: request.title, cover });
      })
      .catch(logError);
  });

  ipcMain.on('ALBUM_COVER_SEARCH', (event, payload: unknown) => {
    const request = parsePayload(albumCoverSearchSchema, payload);
    if (!request) return;

    radioArt
      .searchAlbums(request.query)
      .then((candidates) => sendIfAlive(event.sender, 'ALBUM_COVER_CANDIDATES', { query: request.query, candidates }))
      .catch((error) => {
        logError(error);
        sendIfAlive(event.sender, 'ALBUM_COVER_FAILED', { reason: 'searchFailed' });
      });
  });
};

export default registerAlbumCoverListeners;
