import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import { cancelScansInside } from './scanCancellation';
import { refreshLibraryWatching } from './libraryWatching';
import { deleteFolders, deleteTracksInside, getFolders, getFoldersInside } from './libraryRepository';

/** Remove a library folder, the folders below it and their tracks from the library, the files stay on disk */
async function removeFolderFromLibrary(database: Database, target: unknown, sender: WebContents) {
  const stored = await getFolders(database);
  if (typeof target !== 'string' || !stored.some((folder) => folder.path === target)) return;

  // stops first, so the scan does not keep storing the tracks that are deleted next
  cancelScansInside(target);
  await deleteFolders(database, [{ path: target }, ...(await getFoldersInside(database, target))]);
  await deleteTracksInside(database, target);
  sender.send('STORE_FOLDERS', { folders: await getFolders(database) });
  sender.send('FOLDER_REMOVED_FROM_LIBRARY', {});
  await refreshLibraryWatching();
}

export default removeFolderFromLibrary;
