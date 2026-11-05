import type { WebContents } from 'electron';
import type { Folder } from '@shared/types/library';
import scanFolder from './scan-folder';
import { mapAsync } from '@shared/utils/map-async';

/** Scan provided folders for tracks; answers the ones that have files which did not answer in time, so they are scanned again the next time */
function scanFolders(folders: Pick<Folder, 'path'>[], sender: WebContents): Promise<Pick<Folder, 'path'>[]> {
  return mapAsync(folders, (folder) => scanFolder(folder.path, sender)).then((unanswered) => folders.filter((_, index) => unanswered[index] > 0));
}

export default scanFolders;
