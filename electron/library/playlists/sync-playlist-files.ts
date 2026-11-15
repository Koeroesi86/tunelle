import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import { removeVanishedPlaylists } from './imported-playlists';
import { importPlaylistFiles } from './import-playlist-files';
import { sendPlaylists } from './send-playlists';

const logFailure = (folderPath: string) => (error: unknown) => {
  console.error(`Importing the playlists of ${folderPath} failed`, error);
  return undefined;
};

/** What the scan of a folder does with the playlist files it found: imports the new and changed ones and removes the playlists of the files that are gone, then tells the window. It never fails the scan. See docs/app/playlist-import.md */
export const syncPlaylistFiles = async (database: Database, sender: WebContents, folderPath: string, deep: boolean, playlistFiles: string[]) => {
  const reports = await importPlaylistFiles(database, playlistFiles).catch(logFailure(folderPath));
  const removed = await removeVanishedPlaylists(database, folderPath, deep, playlistFiles).catch(logFailure(folderPath));
  const changed = (removed ?? 0) > 0 || (reports ?? []).some(({ status }) => status !== 'unchanged');
  await (changed ? sendPlaylists(database, sender) : Promise.resolve()).catch(logFailure(folderPath));
};
