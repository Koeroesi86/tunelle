import path from 'path';
import { dialog, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import type { Database } from 'sqlite3';
import { getMainTranslator } from '../../language';
import { deletePlaylist, getImportedPlaylists } from '../../repositories/playlist-repository';
import { PlaylistWriteError } from './export-playlist';
import { handleWriteFailure } from './handle-write-failure';

const withFile = 0;
const playlistOnly = 1;
const cancel = 2;

/** The user is told that the playlist comes back with the next scan while its file is there, and chooses what goes */
const askAboutFile = ({ name, sourcePath }: { name: string; sourcePath: string }, window: BrowserWindow | null) => {
  const { t } = getMainTranslator();
  const options = {
    type: 'warning' as const,
    message: t('playlists.deleteFileAsk', { name }),
    detail: t('playlists.deleteFileDetail', { file: path.basename(sourcePath) }),
    buttons: [t('playlists.deleteWithFile'), t('playlists.deletePlaylistOnly'), t('playlists.deleteCancel')],
    defaultId: cancel,
    cancelId: cancel,
  };

  return (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)).then(({ response }) => response);
};

/** True when the file is in the trash; a file that cannot be moved there is told with a notification */
const trashFile = (database: Database, window: BrowserWindow | null, id: number, filePath: string) =>
  shell.trashItem(filePath).then(
    () => true,
    async (error: unknown) => {
      await handleWriteFailure(database, window, id, new PlaylistWriteError(filePath, 'failed', error));
      return false;
    }
  );

/** Delete the playlist. One that was imported from a file asks first: the file goes to the trash with it, or stays and the playlist is made again by the next scan. A file that cannot be moved to the trash keeps the playlist. See docs/app/playlist-import.md */
export const deletePlaylistAfterAsking = async (database: Database, window: BrowserWindow | null, id: number) => {
  const linked = (await getImportedPlaylists(database)).find((playlist) => playlist.id === id);
  const response = linked ? await askAboutFile(linked, window) : playlistOnly;

  if (response === cancel) return;
  if (linked && response === withFile && !(await trashFile(database, window, id, linked.sourcePath))) return;

  await deletePlaylist(database, id);
};
