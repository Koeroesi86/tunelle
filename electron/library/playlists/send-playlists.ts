import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import type { PlaylistMessage, StoredPlaylist } from '@shared/types/playlists';
import { getImportedPlaylists, getPlaylists } from '../../repositories/playlist-repository';
import { findTrackFormat } from '../../repositories/library-repository';
import { isRecord } from '@shared/utils/is-record';
import { sendIfAlive } from '../../utils/send-if-alive';

const withAvailability = async (database: Database, playlists: StoredPlaylist[]) => {
  const files = new Map((await getImportedPlaylists(database)).map(({ id, sourcePath, sync }) => [id, { path: sourcePath, sync }]));

  return Promise.all(
    playlists.map(async ({ id, name, entries }): Promise<PlaylistMessage> => {
      const formats = await Promise.all(entries.map(({ path }) => findTrackFormat(database, path)));

      return {
        id,
        name,
        file: files.get(id),
        // a track the library does not have is kept, shown from its snapshot and not played; one it has shows the format the library reads of it now
        entries: entries.map(({ id: entryId, snapshot }, index) => ({
          id: entryId,
          track: isRecord(snapshot) ? { ...snapshot, ...formats[index] } : snapshot,
          available: formats[index] !== undefined,
        })),
      };
    })
  );
};

/** Tell the window the playlists as they are now */
export const sendPlaylists = async (database: Database, sender: WebContents) => {
  const playlists = await withAvailability(database, await getPlaylists(database));
  // the window can be closed while the database answers
  sendIfAlive(sender, 'PLAYLISTS', { playlists });
};
