import fs from 'fs';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { Folder } from '../types/library';
import { deleteTracks, getFolders, getLibrary, saveFolders } from './repositories/libraryRepository';
import { isInsideFolder, reportOfflineFolders, withTimeout } from './folderAvailability';
import scanFolders from './scanFolders';
import { storeAlbumArtAccents } from './albumArtAccents';
import { quitSignal } from './scanCancellation';
import { findMissingTracks } from './missingTracks';
import { folderColumns } from './constants/library';

const readModifiedTimes = async (folders: Folder[]) => {
  const times = await Promise.all(folders.map(async (folder) => [folder.path, await withTimeout(fs.promises.stat(folder.path), undefined)] as const));
  return new Map(times.flatMap(([folderPath, stat]) => (stat ? [[folderPath, Math.floor(stat.mtimeMs)] as const] : [])));
};

/** The tracks below an offline folder are kept, its files cannot be told from missing ones */
const removeMissingTracks = async (database: Database, offline: string[]) => {
  const tracks = (await getLibrary(database, { sort: undefined, folders: [] }, ['path'])).filter(
    (track) => !offline.some((folderPath) => isInsideFolder(folderPath, track.path))
  );
  const missing = await findMissingTracks(tracks);

  missing.forEach((track) => console.log(`Removing non existent ${track.path}`));
  console.log(`Removing ${missing.length} of ${tracks.length} songs`);
  await deleteTracks(database, missing);
};

/** Scan the changed folders, and remove the tracks that are gone */
async function rescanLibrary(sender: WebContents, forced = false) {
  const database = global._database;
  if (!database) return;
  console.log(`Scanning library ${forced ? 'completely' : 'wisely'}...`);

  try {
    const all = await getFolders(database, folderColumns);
    const { offline } = await reportOfflineFolders(database, sender, all);
    const folders = all.filter((folder) => !offline.includes(folder.path));
    const modified = await readModifiedTimes(folders);
    const changed = folders.filter((folder) => (forced ? modified.has(folder.path) : folder.lastModified < (modified.get(folder.path) ?? 0)));

    const incomplete = new Set((await scanFolders(changed, sender)).map((folder) => folder.path));
    // a folder that was removed while it was scanned is not stored again
    const remaining = new Set((await getFolders(database, ['path'])).map((folder) => folder.path));
    // stored after the scan, with the time seen before it, so a failed or interrupted scan is retried, and so is one that left files unread
    await saveFolders(
      database,
      changed
        .filter((folder) => remaining.has(folder.path) && !incomplete.has(folder.path))
        .map((folder) => ({ path: folder.path, lastModified: modified.get(folder.path) ?? folder.lastModified }))
    );
    await removeMissingTracks(database, offline);
    // the pictures of a library from before the colours were kept
    await storeAlbumArtAccents(database).catch((error) => console.error('Picking the colours of the album art failed', error));
    sender.send('RESCAN_COMPLETE', {});
  } catch (e) {
    (quitSignal.aborted ? console.log : console.error)(quitSignal.aborted ? 'Scan stopped, the app is quitting' : e);
  }
}

export default rescanLibrary;
