import { chmod, lstat, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { logError } from '../utils/log-error';

// See docs/app/decoder-proxy.md for the folders of the caches
type CacheName = 'whole-decodes' | 'source';

const oldNames = ['tunelle-decoded', 'tunelle-whole-decodes', 'tunelle-source'];

/** One for each user, as all users of a Linux system share the temp folder; Windows has no user ids and a temp folder for each user */
const userFolder = () => join(app.getPath('temp'), `tunelle-${process.getuid?.() ?? 'user'}`);

export const cacheFolder = (name: CacheName) => join(userFolder(), name);

/** Makes a folder that only this user reads and writes, and throws for a link or a folder of another user in its place */
const makeOwnFolder = async (folder: string) => {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const stats = await lstat(folder);
  if (!stats.isDirectory() || stats.uid !== uid) throw new Error(`${folder} is not a folder of this user`);
  await chmod(folder, 0o700);
};

/** The folder of a cache, to be made before a file of it is read or written */
export const makeCacheFolder = async (name: CacheName) => {
  await makeOwnFolder(userFolder());
  await makeOwnFolder(cacheFolder(name));
  return cacheFolder(name);
};

/** Removes the caches of the earlier versions, which had one folder for all users */
export const removeOldCache = () => Promise.all(oldNames.map((name) => rm(join(app.getPath('temp'), name), { recursive: true, force: true }).catch(logError)));
