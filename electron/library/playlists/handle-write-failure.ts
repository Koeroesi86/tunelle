import path from 'path';
import { BrowserWindow, Notification, dialog } from 'electron';
import type { Database } from 'sqlite3';
import { getMainTranslator } from '../../language';
import { setPlaylistSync } from '../../repositories/playlist-repository';
import { logError } from '../../utils/log-error';
import { PlaylistWriteError, switchToM3u8 } from './export-playlist';

const notifyFailure = (error: PlaylistWriteError) => {
  const { t } = getMainTranslator();
  const reason = error.cause instanceof Error ? error.cause.message : '';

  if (Notification.isSupported()) {
    new Notification({ title: t('playlists.writeFailed', { file: path.basename(error.filePath) }), body: reason || t('playlists.writeFailedBody') }).show();
  }
};

/** The characters do not fit the encoding of the `.m3u`: the user chooses between writing `.m3u8` instead and leaving the file alone, which turns the sync of the playlist off so the question is not asked at every change */
const askAboutEncoding = async (database: Database, window: BrowserWindow | null, id: number, error: PlaylistWriteError) => {
  const { t } = getMainTranslator();
  const options = {
    type: 'warning' as const,
    message: t('playlists.encodingPrompt', { file: path.basename(error.filePath) }),
    detail: t('playlists.encodingPromptDetail'),
    buttons: [t('playlists.encodingSwitch'), t('playlists.encodingKeep')],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));

  if (response === 0) await switchToM3u8(database, id);
  else await setPlaylistSync(database, id, false);
};

/** What is done when a playlist could not be written to its file: a notification tells it, and for an encoding that cannot hold the text the user is asked. The change in the app stays. See docs/app/playlist-export.md */
export const handleWriteFailure = async (database: Database, window: BrowserWindow | null, id: number, error: unknown) => {
  logError(error);
  if (!(error instanceof PlaylistWriteError)) return;

  await (error.kind === 'encoding' ? askAboutEncoding(database, window, id, error) : Promise.resolve(notifyFailure(error))).catch((followUp: unknown) => {
    logError(followUp);
    notifyFailure(followUp instanceof PlaylistWriteError ? followUp : error);
  });
};
