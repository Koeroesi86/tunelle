import fs from 'fs';
import path from 'path';
import { isInsideFolder, withTimeout } from './folderAvailability';

/** A place in a library folder that changed: its own files, and the folders below it when it is deep */
export interface Change {
  path: string;
  deep: boolean;
}

export const changeKey = ({ path: changed, deep }: Change) => `${deep ? 'deep' : 'shallow'}:${changed}`;

/** What a path that the file system reported means: a folder is scanned with what is below it, as it can be a whole album that was moved in; for a file the folder it is in is scanned, and for a path that is gone, the tracks below it and the folder it was in are looked at */
export const toChanges = async (changedPath: string): Promise<Change[]> => {
  const stat = await withTimeout(fs.promises.stat(changedPath), undefined);
  if (stat?.isDirectory()) return [{ path: changedPath, deep: true }];

  const directory = { path: path.dirname(changedPath), deep: false };
  return stat ? [directory] : [{ path: changedPath, deep: true }, directory];
};

const covers = (outer: Change, inner: Change) => outer.deep && (outer.path === inner.path || isInsideFolder(outer.path, inner.path));

/** The changes without the ones that another one covers, as a folder that is scanned with what is below it needs no scan of a folder in it */
export const withoutCovered = (changes: Change[]) => {
  const unique = [...new Map(changes.map((change) => [changeKey(change), change])).values()];

  return unique.filter((change) => !unique.some((other) => other !== change && covers(other, change)));
};
