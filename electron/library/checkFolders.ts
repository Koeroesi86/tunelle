import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { reportOfflineFolders } from './folderAvailability';
import rescanLibrary from './rescanLibrary';
import { checkLibraryWatching, refreshLibraryWatching } from './libraryWatching';

/** Tell the window which library folders are offline, rescan when one of them came back, and watch the folders that can be read */
async function checkFolders(database: Database, sender: WebContents) {
  const { offline, recovered } = await reportOfflineFolders(database, sender);
  await refreshLibraryWatching(offline);
  if (recovered.length > 0) await rescanLibrary(sender);
  await checkLibraryWatching();
}

export default checkFolders;
