import path from 'path';
import type { Database } from 'sqlite3';
import { folderTargetSchema } from '@shared/schemas/requests';
import { getFolders } from '../repositories/library-repository';

const absolutePathSchema = folderTargetSchema.refine((target) => path.isAbsolute(target));

const isInside = (folder: string, target: string) => {
  const relative = path.relative(folder, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

/** Open a path in the file manager when it is a library folder or inside one, anything else from the renderer is ignored */
async function openLibraryPath(database: Database, target: unknown, open: (target: string) => Promise<string>) {
  const absolute = absolutePathSchema.safeParse(target).data;
  if (absolute === undefined) return;

  const folders = await getFolders(database);
  if (folders.some((folder) => isInside(folder.path, absolute))) await open(absolute);
}

export default openLibraryPath;
