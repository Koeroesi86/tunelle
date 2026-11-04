import fs from 'fs';
import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import { deleteFolders, folderColumns, getFolders, getFoldersInside, saveFolders } from './libraryRepository';
import scanFolders from './scanFolders';
import { refreshLibraryWatching } from './libraryWatching';

interface AddedFile {
  path: string;
  lastModified: number;
}

const isAddedFile = (item: unknown): item is AddedFile =>
  typeof item === 'object' &&
  item !== null &&
  'path' in item &&
  typeof item.path === 'string' &&
  'lastModified' in item &&
  typeof item.lastModified === 'number';

const isDirectory = (filePath: string) => {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
};

/** Add the directories among the dropped files to the library, replacing the folders inside them, and scan them */
async function addFoldersToLibrary(database: Database, payload: unknown, sender: WebContents) {
  const folders = (Array.isArray(payload) ? payload : []).filter(isAddedFile).filter((file) => isDirectory(file.path));

  const nested = await Promise.all(folders.map((folder) => getFoldersInside(database, folder.path)));
  await deleteFolders(database, nested.flat());
  await saveFolders(database, folders);
  sender.send('STORE_FOLDERS', { folders: await getFolders(database, folderColumns) });
  sender.send('FOLDERS_ADDED_TO_LIBRARY', { folders });

  await refreshLibraryWatching();
  const incomplete = await scanFolders(folders, sender);
  // time zero is older than any folder, so the next wise scan looks at it again for the files that did not answer
  await saveFolders(
    database,
    incomplete.map((folder) => ({ path: folder.path, lastModified: 0 }))
  );
  sender.send('TRACKS_ADDED_TO_LIBRARY', {});
}

export default addFoldersToLibrary;
