import type { Folder } from '../../types/library';

/** Every column of a folder, for the ones that need them all */
export const folderColumns = ['path', 'lastModified'] as const satisfies readonly (keyof Folder)[];
