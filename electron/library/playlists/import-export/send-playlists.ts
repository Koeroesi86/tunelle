import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import type { PlaylistMessage, StoredPlaylist } from '@shared/types/playlists';
import { getImportedPlaylists, getPlaylists } from '../../../repositories/playlist-repository';
import { findTrackFormat, getTrackListByPaths } from '../../../repositories/library-repository';
import { isRecord } from '@shared/utils/is-record';
import { sendIfAlive } from '../../../utils/send-if-alive';

const withAvailability = async (database: Database, playlists: StoredPlaylist[]) => {
  const files = new Map(
    (await getImportedPlaylists(database)).map(({ id, sourcePath, sync, encoding, encodingOverride, canUndo }) => [
      id,
      { path: sourcePath, sync, encoding: encoding ?? undefined, encodingOverride: encodingOverride ?? undefined, canUndo },
    ])
  );

  const known = new Map(
    (await getTrackListByPaths(database, [...new Set(playlists.flatMap(({ entries }) => entries.map(({ path }) => path)))])).map((track) => [track.path, track])
  );

  return Promise.all(
    playlists.map(async ({ id, name, entries }): Promise<PlaylistMessage> => {
      const formats = await Promise.all(entries.map(({ path }) => findTrackFormat(database, path)));

      return {
        id,
        name,
        file: files.get(id),
        // a track the library does not have is kept, shown from its snapshot and not played; one it has shows what the library has of it now (also an entry of a file that was not in the library when it was imported) and the format it reads of it
        entries: entries.map(({ id: entryId, path, snapshot }, index) => {
          const shown = known.get(path) ?? snapshot;
          return { id: entryId, track: isRecord(shown) ? { ...shown, ...formats[index] } : shown, available: formats[index] !== undefined };
        }),
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
