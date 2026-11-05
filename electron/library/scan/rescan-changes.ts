import fs from 'fs';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import { deleteTracks, getFolders, getTracksInside } from '../../repositories/library-repository';
import { isDirectlyInside, isInsideFolder, reportOfflineFolders } from '../watch/folder-availability';
import { withoutCovered } from '../watch/library-change';
import type { Change } from '../watch/library-change';
import { findMissingTracks } from './missing-tracks';
import scanFolder from './scan-folder';
import { mapAsync } from '@shared/utils/map-async';

const isDirectory = (folderPath: string) =>
  fs.promises.stat(folderPath).then(
    (stat) => stat.isDirectory(),
    () => false
  );

const tracksAt = (database: Database) => async (change: Change) => {
  const tracks = await getTracksInside(database, change.path, ['path']);
  return change.deep ? tracks : tracks.filter((track) => isDirectlyInside(change.path, track.path));
};

/** Scan the places that changed and remove the tracks that are gone from them, which costs what changed and not the size of the library; the tracks below an offline folder are kept, its files cannot be told from missing ones */
async function rescanChanges(sender: WebContents, changes: Change[]) {
  const database = global._database;
  if (!database) return;

  try {
    const { offline } = await reportOfflineFolders(database, sender, await getFolders(database, ['path']));
    const places = withoutCovered(changes).filter(
      (change) => !offline.some((folderPath) => change.path === folderPath || isInsideFolder(folderPath, change.path))
    );
    console.log(`Scanning ${places.length} changed folders...`);

    await mapAsync(places, async (place) => {
      if (await isDirectory(place.path)) await scanFolder(place.path, sender, place.deep);
    });

    const tracks = new Map<string, Pick<Track, 'path'>>((await Promise.all(places.map(tracksAt(database)))).flat().map((track) => [track.path, track]));
    const missing = await findMissingTracks([...tracks.values()]);
    missing.forEach((track) => console.log(`Removing non existent ${track.path}`));
    await deleteTracks(database, missing);
    sender.send('RESCAN_COMPLETE', {});
  } catch (e) {
    console.error(e);
  }
}

export default rescanChanges;
