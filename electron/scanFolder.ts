import path from 'path';
import fs from 'fs';
import { setImmediate as yieldToEventLoop } from 'timers/promises';
import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import type { Track } from '../types/library';
import { addTracks, readBatchSize } from './addTracks';
import { createTrackReader } from './trackReader';
import { getTracksInside } from './libraryRepository';
import isSupported from './isSupported';
import { quitSignal, trackScan } from './scanCancellation';

const fileReadTimeout = 2000;

const isEqual = (a: Track, b: Track) => {
  const other = new Map(Object.entries(b));
  return Object.entries(a).every(([key, value]) => `${value}` === `${other.get(key)}`);
};

// an entry that is a symbolic link is neither a directory nor a file here
const findEntryFiles = async (directory: string, entry: fs.Dirent, deep: boolean): Promise<string[]> => {
  const entryPath = path.join(directory, entry.name);
  if (entry.isDirectory()) return deep ? findFiles(entryPath, deep) : [];
  return entry.isFile() && isSupported(entryPath) ? [entryPath] : [];
};

/** Collect the supported audio files of a folder tree, or of the folder itself when it is not deep, one folder at a time, symbolic links are skipped */
const findFiles = async (directory: string, deep: boolean): Promise<string[]> => {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  // not found.push(...files): a folder with many files is more arguments than the stack takes
  for (const entry of entries) (await findEntryFiles(directory, entry, deep)).forEach((file) => found.push(file));

  return found;
};

const progressInterval = 100;

/** Tells the window about a file a few times a second, with the last one always, as a message for each of tens of thousands of files keeps it from answering */
const createProgressReporter = (sender: WebContents, folderPath: string, totalCount: number) => {
  let shownFolder = folderPath;
  let shownAt = 0;

  return (fileName: string, progress: number) => {
    if (Date.now() - shownAt < progressInterval && progress !== totalCount - 1) return;

    const folder = path.dirname(fileName);
    if (folder !== shownFolder) sender.send('SCANNING_FOLDER', { folder });
    shownFolder = folder;
    shownAt = Date.now();
    sender.send('SCANNING_FILE', { fileName, progress, totalCount });
  };
};

/** Collects the tracks to store and writes them a batch at a time; a batch that cannot be written is stored track by track, so one bad track does not take the others with it */
const createBatchWriter = (database: Database, size: number, signal: AbortSignal) => {
  let batch: Track[] = [];

  const flush = async () => {
    // a folder removed while its files were read must not get the tracks back
    signal.throwIfAborted();
    const tracks = batch;
    batch = [];
    await addTracks(database, tracks).catch((error) => {
      console.error('Storing a batch of tracks failed, storing them one by one', error);
      return tracks.reduce(
        (done, track) => done.then(() => addTracks(database, [track]).catch((trackError) => console.error(track.path, trackError))),
        Promise.resolve()
      );
    });
  };

  return {
    add: async (track: Track) => {
      batch.push(track);
      if (batch.length >= size) await flush();
    },
    flush: () => (batch.length > 0 ? flush() : Promise.resolve()),
  };
};

const scanFiles = async (folderPath: string, sender: WebContents, deep: boolean, signal: AbortSignal) => {
  const database = global._database;
  if (!database) throw new Error('Database is not connected');

  const files = (await findFiles(folderPath, deep)).sort();
  signal.throwIfAborted();
  const library = await getTracksInside(database, folderPath);
  const existingTracks = new Map(library.map((track) => [track.path, track]));
  const report = createProgressReporter(sender, folderPath, files.length);
  const reader = createTrackReader();
  const writer = createBatchWriter(database, readBatchSize(), signal);

  const scanFile = async (fileName: string, progress: number) => {
    signal.throwIfAborted();
    report(fileName, progress);

    // the abort is for the loop, which stops at the next file; a failed file is logged and skipped, and one that takes too long is not stored
    await reader
      .read(fileName, global._appDataPath, fileReadTimeout)
      .then(async (meta) => {
        // a folder removed while the file was read must not get the track back
        signal.throwIfAborted();
        const existingTrack = existingTracks.get(meta.path);
        if (!existingTrack || !isEqual(existingTrack, meta)) await writer.add(meta);
      })
      .catch((error) => !signal.aborted && console.error(fileName, error));
    // yields to the event loop between files, so the server and the window stay responsive during a scan
    await yieldToEventLoop();
  };

  const scanAll = async () => {
    for (const [progress, fileName] of files.entries()) await scanFile(fileName, progress);
    await writer.flush();
  };

  await scanAll().finally(reader.close);
};

/** Scan a defined folder for tracks, and the folders below it unless it is not deep; an aborted signal ends the scan with its error, so the caller does not take the folder for scanned, but a folder that is removed from the library ends it without one */
const scanFolder = async (folderPath: string, sender: WebContents, deep = true, parent: AbortSignal = quitSignal) => {
  if (!global._database) throw new Error('Database is not connected');
  const { signal, wasRemoved, release } = trackScan(folderPath, parent);

  // shown while the folders are listed, which takes a while on a big drive
  sender.send('SCANNING_FOLDER', { folder: folderPath });

  await scanFiles(folderPath, sender, deep, signal)
    .catch((error) => {
      if (!wasRemoved()) throw error;
    })
    .finally(release);
};

export default scanFolder;
