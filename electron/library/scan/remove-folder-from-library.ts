import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import { folderTargetSchema } from '@shared/schemas/requests';
import { cancelScansInside } from './scan-cancellation';
import { refreshLibraryWatching } from '../watch/library-watching';
import { deleteFolders, deleteTracksInside, getFolders, getFoldersInside } from '../../repositories/library-repository';

/** Remove a library folder, the folders below it and their tracks from the library, the files stay on disk */
async function removeFolderFromLibrary(database: Database, target: unknown, sender: WebContents) {
  const stored = await getFolders(database);
  const folder = folderTargetSchema.safeParse(target).data;
  if (folder === undefined || !stored.some((item) => item.path === folder)) return;

  // stops first, so the scan does not keep storing the tracks that are deleted next
  cancelScansInside(folder);
  await deleteFolders(database, [{ path: folder }, ...(await getFoldersInside(database, folder))]);
  await deleteTracksInside(database, folder);
  sender.send('STORE_FOLDERS', { folders: await getFolders(database) });
  sender.send('FOLDER_REMOVED_FROM_LIBRARY', {});
  await refreshLibraryWatching();
}

export default removeFolderFromLibrary;
