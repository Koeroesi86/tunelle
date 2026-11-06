import fs from 'fs';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { Folder } from '@shared/types/library';
import { deleteTracks, getFolders, getLibrary, saveFolders } from '../../repositories/library-repository';
import { isInsideFolder, reportOfflineFolders, withTimeout } from '../watch/folder-availability';
import scanFolders from './scan-folders';
import { queueAlbumArtAccents } from '../art/album-art-accents';
import { quitSignal } from './scan-cancellation';
import { findMissingTracks } from './missing-tracks';
import isSupported, { isSupportedCodec } from '../../utils/is-supported';
import { folderColumns } from '../../constants/library';
import { scanKind } from '../tasks/background-queue';
import { queueTask, scanPriority } from '../tasks/queue-task';

const readModifiedTimes = async (folders: Folder[]) => {
  const times = await Promise.all(folders.map(async (folder) => [folder.path, await withTimeout(fs.promises.stat(folder.path), undefined)] as const));
  return new Map(times.flatMap(([folderPath, stat]) => (stat ? [[folderPath, Math.floor(stat.mtimeMs)] as const] : [])));
};

/** The tracks below an offline folder are kept, its files cannot be told from missing ones; the tracks of a format or codec that is not played go too */
const removeMissingTracks = async (database: Database, offline: string[]) => {
  const tracks = (await getLibrary(database, { sort: undefined, folders: [] }, ['path', 'codec'])).filter(
    (track) => !offline.some((folderPath) => isInsideFolder(folderPath, track.path))
  );
  const missing = await findMissingTracks(tracks);
  const unsupported = tracks.filter((track) => !isSupported(track.path) || !isSupportedCodec(track.codec));

  missing.forEach((track) => console.log(`Removing non existent ${track.path}`));
  unsupported.forEach((track) => console.log(`Removing unsupported format ${track.path}`));
  console.log(`Removing ${missing.length + unsupported.length} of ${tracks.length} songs`);
  await deleteTracks(database, [...missing, ...unsupported]);
};

/** Scan the changed folders, and remove the tracks that are gone */
async function scanLibrary(sender: WebContents, forced: boolean) {
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
    queueAlbumArtAccents(database);
    sender.send('RESCAN_COMPLETE', {});
  } catch (e) {
    (quitSignal.aborted ? console.log : console.error)(quitSignal.aborted ? 'Scan stopped, the app is quitting' : e);
  }
}

let forcedWaiting: { forced: boolean } | undefined;

/** Queue a scan of the changed folders as the first work of the background queue; a scan that waits is shared, and is complete when any of the callers asked for it. See docs/app/task-queue.md */
function rescanLibrary(sender: WebContents, forced = false) {
  if (forcedWaiting) forcedWaiting.forced ||= forced;
  const entry = forcedWaiting ?? { forced };
  forcedWaiting = entry;

  return queueTask(scanKind, 'rescan-library', scanPriority, () => {
    forcedWaiting = undefined;
    return scanLibrary(sender, entry.forced);
  });
}

export default rescanLibrary;
