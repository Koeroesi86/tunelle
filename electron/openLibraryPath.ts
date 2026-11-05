import path from 'path';
import type { Database } from 'sqlite3';
import { getFolders } from './repositories/libraryRepository';

const isInside = (folder: string, target: string) => {
  const relative = path.relative(folder, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

/** Open a path in the file manager when it is a library folder or inside one, anything else from the renderer is ignored */
async function openLibraryPath(database: Database, target: unknown, open: (target: string) => Promise<string>) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) return;

  const folders = await getFolders(database, ['path']);
  if (folders.some((folder) => isInside(folder.path, target))) await open(target);
}

export default openLibraryPath;
