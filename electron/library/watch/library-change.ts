import { isInsideFolder } from './folder-availability';

/** A place in a library folder that changed: its own files, and the folders below it when it is deep */
export interface Change {
  path: string;
  deep: boolean;
}

export const changeKey = ({ path: changed, deep }: Change) => `${deep ? 'deep' : 'shallow'}:${changed}`;

const covers = (outer: Change, inner: Change) => outer.deep && (outer.path === inner.path || isInsideFolder(outer.path, inner.path));

/** The changes without the ones that another one covers, as a folder that is scanned with what is below it needs no scan of a folder in it */
export const withoutCovered = (changes: Change[]) => {
  const unique = [...new Map(changes.map((change) => [changeKey(change), change])).values()];

  return unique.filter((change) => !unique.some((other) => other !== change && covers(other, change)));
};
