import { chmod, lstat, mkdir, readdir, rm, stat } from 'fs/promises';
import { isAbsolute, join } from 'path';
import { app } from 'electron';
import { logError } from '../utils/log-error';

// See docs/app/decoder-proxy.md for the folders of the caches
const cacheNames = ['whole-decodes', 'source'] as const;
type CacheName = (typeof cacheNames)[number];

const oldNames = ['tunelle-decoded', 'tunelle-whole-decodes', 'tunelle-source'];

/** A part file that nothing wrote to for this long is of a run that is over: ffmpeg and a download write all the time */
const abandonedAfter = 60_000;

/** One for each user, as all users of a system may share the temp folder; Windows has no user ids and a temp folder for each user */
const tempUserFolder = () => join(app.getPath('temp'), `tunelle-${process.getuid?.() ?? 'user'}`);

/** The cache folder of the user by the XDG specification, which ignores a relative path */
const xdgFolder = () => {
  const { XDG_CACHE_HOME: set = '' } = process.env;
  return join(isAbsolute(set) ? set : join(app.getPath('home'), '.cache'), 'tunelle');
};

// on Linux the temp folder is in RAM on some systems, as Fedora
const userFolder = () => (process.platform === 'linux' ? xdgFolder() : tempUserFolder());

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

const remove = (path: string) => rm(path, { recursive: true, force: true }).catch(logError);

const removeAbandoned = async (part: string) => {
  const { mtimeMs } = await stat(part);
  if (mtimeMs < Date.now() - abandonedAfter) await remove(part);
};

/** The files that a quit or a crash left half written */
const removeParts = async (name: CacheName) => {
  const folder = await makeCacheFolder(name);
  const parts = (await readdir(folder)).filter((file) => file.endsWith('.part'));
  await Promise.all(parts.map((file) => removeAbandoned(join(folder, file))));
};

/** Removes what earlier runs left: the half written files, and the caches of the earlier versions in the temp folder */
export const removeOldCache = () => {
  // the earlier versions on Linux had the folder of the user in the temp folder too
  const moved = process.platform === 'linux' ? [tempUserFolder()] : [];
  const old = [...oldNames.map((name) => join(app.getPath('temp'), name)), ...moved];
  return Promise.all([...old.map(remove), ...cacheNames.map((name) => removeParts(name).catch(logError))]);
};
