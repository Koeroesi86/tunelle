import type { Database } from 'sqlite3';
import { deletePlaylist, getImportedPlaylists, getPlaylists, unlinkPlaylists } from '../../../repositories/playlist-repository';
import { getTrackListByPaths } from '../../../repositories/library-repository';
import normalizePath from '../../../utils/normalize-path';
import { isDirectlyInside, isInsideFolder } from '../../watch/folder-availability';

/** The playlists whose file was in a scanned folder (below it too when it is deep) and is not there any more are removed with it. The folder is one that answered, an offline one is not scanned. See docs/app/playlist-import.md */
export const removeVanishedPlaylists = async (database: Database, folderPath: string, deep: boolean, foundFiles: string[]) => {
  const found = new Set(foundFiles.map(normalizePath));
  const isInside = deep ? isInsideFolder : isDirectlyInside;
  const vanished = (await getImportedPlaylists(database)).filter(({ sourcePath }) => isInside(folderPath, sourcePath) && !found.has(sourcePath));

  await Promise.all(vanished.map(({ id }) => deletePlaylist(database, id)));
  return vanished.length;
};

/** A folder leaves the library: the playlists of its files that have no track left in the library go, the others stay as playlists of the app without a file. Called after the tracks of the folder are deleted. See docs/app/playlist-import.md */
export const settlePlaylistsOfRemovedFolder = async (database: Database, folderPath: string) => {
  const inside = (await getImportedPlaylists(database)).filter(({ sourcePath }) => isInsideFolder(folderPath, sourcePath));
  const entries = new Map((await getPlaylists(database)).map(({ id, entries: playlistEntries }) => [id, playlistEntries]));
  const available = await Promise.all(
    inside.map(
      async ({ id }) =>
        (
          await getTrackListByPaths(
            database,
            (entries.get(id) ?? []).map(({ path }) => path)
          )
        ).length > 0
    )
  );

  await Promise.all(inside.filter((_, index) => !available[index]).map(({ id }) => deletePlaylist(database, id)));
  await unlinkPlaylists(
    database,
    inside.filter((_, index) => available[index]).map(({ id }) => id)
  );
};
