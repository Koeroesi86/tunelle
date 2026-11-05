import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import addFoldersToLibrary from './addFoldersToLibrary';

type OpenDialog = () => Promise<{ canceled: boolean; filePaths: string[] }>;

/** Let the user pick folders in the native dialog and add them like dropped ones */
async function pickFolders(database: Database, sender: WebContents, openDialog: OpenDialog) {
  const { canceled, filePaths } = await openDialog();
  if (canceled) return;

  await addFoldersToLibrary(
    database,
    filePaths.map((filePath) => ({ path: filePath, lastModified: Date.now() })),
    sender
  );
}

export default pickFolders;
