import { cpSync, existsSync } from 'fs';
import { basename, join } from 'path';

// what a running app holds open or can rebuild: a copy of a lock would make the copy of the app look like a second instance
const skipped = new Set(['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile', 'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'GrShaderCache']);

/** The name of the app that shows in the OS (the media controls, the dock): the folder of Electron's own data follows it */
export const getAppName = (isDev: boolean) => `Tunelle${isDev ? '-dev' : ''}`;

const copyFolder = (oldFolder: string, newFolder: string) => {
  try {
    cpSync(oldFolder, newFolder, { recursive: true, force: false, filter: (source) => !skipped.has(basename(source)) });

    return true;
  } catch (error) {
    console.error('The data of the app was not copied from', oldFolder, error);

    return false;
  }
};

/**
 * Copies the Electron data (window state, saved settings of the page) of the folder the app used before it was renamed, once.
 * The old folder stays where it is, and a copy that fails is ignored: the app starts as on a first run.
 */
export const copyOldUserData = (oldFolder: string, newFolder: string) => !existsSync(newFolder) && existsSync(oldFolder) && copyFolder(oldFolder, newFolder);

/**
 * Copies the library folder of the folder the app used before it was renamed, once
 * See docs/user-data.md
 */
export const copyOldLibrary = (oldFolder: string, newFolder: string) =>
  !existsSync(join(newFolder, 'library.sqlite')) && existsSync(oldFolder) && copyFolder(oldFolder, newFolder);
