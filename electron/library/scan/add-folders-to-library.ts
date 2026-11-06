import fs from 'fs';
import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import { deleteFolders, getFolders, getFoldersInside, saveFolders } from '../../repositories/library-repository';
import scanFolders from './scan-folders';
import { addedFilesSchema } from '@shared/schemas/requests';
import { refreshLibraryWatching } from '../watch/library-watching';
import { scanKind } from '../tasks/background-queue';
import { queueTask, scanPriority } from '../tasks/queue-task';

let added = 0;

const isDirectory = (filePath: string) => {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
};

/** Add the directories among the dropped files to the library, replacing the folders inside them, and scan them */
async function addFoldersToLibrary(database: Database, payload: unknown, sender: WebContents) {
  const folders = addedFilesSchema.parse(payload).filter((file) => isDirectory(file.path));

  const nested = await Promise.all(folders.map((folder) => getFoldersInside(database, folder.path)));
  await deleteFolders(database, nested.flat());
  await saveFolders(database, folders);
  sender.send('STORE_FOLDERS', { folders: await getFolders(database) });
  sender.send('FOLDERS_ADDED_TO_LIBRARY', { folders });

  await refreshLibraryWatching();
  await queueTask(scanKind, `add-folders-${added++}`, scanPriority, async () => {
    const incomplete = await scanFolders(folders, sender);
    // time zero is older than any folder, so the next wise scan looks at it again for the files that did not answer
    await saveFolders(
      database,
      incomplete.map((folder) => ({ path: folder.path, lastModified: 0 }))
    );
    sender.send('TRACKS_ADDED_TO_LIBRARY', {});
  });
}

export default addFoldersToLibrary;
