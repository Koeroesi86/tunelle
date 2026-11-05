import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import { createFolderWatcher } from './folderWatcher';
import { findOfflineFolders } from './folderAvailability';
import { getFolders } from '../repositories/libraryRepository';
import { createRescanScheduler } from './rescanScheduler';
import rescanChanges from './rescanChanges';
import rescanLibrary from './rescanLibrary';
import { getSettings } from '../repositories/settingsRepository';

interface Watching {
  database: Database;
  watcher: ReturnType<typeof createFolderWatcher>;
  scheduler: ReturnType<typeof createRescanScheduler>;
}

let watching: Watching | undefined;
let enabled = true;

// only a saved off turns the watching off
const isOff = (settings: unknown) => typeof settings === 'object' && settings !== null && 'watchFolders' in settings && settings.watchFolders === false;

const stop = () => {
  watching?.watcher.close();
  watching?.scheduler.cancel();
  watching = undefined;
};

/** Watch the library folders that can be read, or none when the watching is off; `offline` saves a second look at the folders when the caller has just taken it */
export const refreshLibraryWatching = async (offline?: string[]) => {
  const current = watching;
  if (!current) return;

  const stored = await getFolders(current.database, ['path']);
  const folders = stored.map((folder) => folder.path);
  const unreadable = offline ?? (await findOfflineFolders(current.database, stored));
  // the window can close while the folders are looked at
  if (watching !== current) return;

  await current.watcher.update(enabled ? folders.filter((folder) => !unreadable.includes(folder)) : []);
};

/** Scan the library, and watch its folders until the window is gone, what changed in them is scanned after it is quiet; the scan at start and when a folder is back cover what a watcher does not see */
export const startLibraryWatching = async (database: Database, sender: WebContents) => {
  stop();
  enabled = !isOff(await getSettings(database));

  const scheduler = createRescanScheduler((changes) => rescanChanges(sender, changes));
  const current = { database, scheduler, watcher: createFolderWatcher(scheduler.schedule) };
  watching = current;
  sender.once('destroyed', () => watching === current && stop());

  rescanLibrary(sender);
  await refreshLibraryWatching();
};

/** Look at the watched folders for a change the watch did not report, as on a network drive; a look a moment ago is not repeated */
export const checkLibraryWatching = async () => {
  await watching?.watcher.check();
};

/** Follow the setting of the window */
export const applyWatchSetting = (settings: unknown) => {
  const next = !isOff(settings);
  if (next === enabled) return Promise.resolve();

  enabled = next;
  return refreshLibraryWatching();
};
