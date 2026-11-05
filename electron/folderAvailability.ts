import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import type { Folder } from '../types/library';
import { getFolders, hasTracksInside } from './repositories/libraryRepository';

/** How long a call against a folder may take before the folder counts as unresponsive */
const folderTimeout = 5000;

/** The result of the promise, or the fallback when it takes longer than the timeout (a call that hangs on a dead mount cannot be cancelled, only left behind) */
export const withTimeout = <T>(promise: Promise<T>, fallback: T, timeout = folderTimeout): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeout);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });

/** Whether a file is in a folder or below it; the scan stores the paths of tracks with forward slashes, the folder keeps the ones it was picked with */
export const isInsideFolder = (folderPath: string, filePath: string) => {
  const trimmed = folderPath.replace(/[\\/]+$/, '');

  return [`${trimmed.replace(/\\/g, '/')}/`, `${trimmed}${path.sep}`].some((prefix) => filePath.startsWith(prefix));
};

/** Whether a file is in a folder itself, not in a folder below it */
export const isDirectlyInside = (folderPath: string, filePath: string) =>
  isInsideFolder(folderPath, filePath) && !/[\\/]/.test(filePath.slice(folderPath.replace(/[\\/]+$/, '').length + 1));

const hasEntries = async (folderPath: string) => {
  const directory = await fs.promises.opendir(folderPath);
  return directory.read().then(
    (entry) => directory.close().then(() => entry !== null),
    (e) => directory.close().then(() => Promise.reject(e))
  );
};

/** A folder that cannot be read is offline; so is an empty one that has tracks in the library, like the mount point of a drive that is not mounted */
const isOffline = async (database: Database, { path: folderPath }: Pick<Folder, 'path'>) => {
  const entries = await withTimeout(hasEntries(folderPath), undefined);
  return entries === undefined || (!entries && (await hasTracksInside(database, folderPath)));
};

export const findOfflineFolders = async (database: Database, folders: Pick<Folder, 'path'>[]) => {
  const offline = await Promise.all(folders.map((folder) => isOffline(database, folder)));
  return folders.filter((_folder, index) => offline[index]).map((folder) => folder.path);
};

let known: string[] = [];

/** Look at the library folders, tell the window which are offline, and return the ones that were offline the last time and are not now */
export const reportOfflineFolders = async (database: Database, sender: WebContents, folders?: Pick<Folder, 'path'>[]) => {
  const offline = await findOfflineFolders(database, folders ?? (await getFolders(database, ['path'])));
  const recovered = known.filter((folderPath) => !offline.includes(folderPath));
  known = offline;
  sender.send('OFFLINE_FOLDERS', { folders: offline });

  return { offline, recovered };
};
