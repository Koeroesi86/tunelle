import type { Folder } from '@shared/types/library';
import { knownFolders } from '@shared/types/library-query';

/** The selected folders that the library still has */
export const selectedFolders = (selected: string[], folders: Folder[]) =>
  knownFolders(
    selected,
    folders.map(({ path }) => path)
  );
