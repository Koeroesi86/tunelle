import type { WebContents } from 'electron';
import type { Folder } from '@shared/types/library';
import scanFolder from './scan-folder';

/** Scan provided folders for tracks; answers the ones that have files which did not answer in time, so they are scanned again the next time */
function scanFolders(folders: Pick<Folder, 'path'>[], sender: WebContents): Promise<Pick<Folder, 'path'>[]> {
  return folders.reduce<Promise<Pick<Folder, 'path'>[]>>(
    (done, folder) => done.then(async (incomplete) => ((await scanFolder(folder.path, sender)) > 0 ? [...incomplete, folder] : incomplete)),
    Promise.resolve([])
  );
}

export default scanFolders;
