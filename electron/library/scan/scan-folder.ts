import path from 'path';
import fs from 'fs';
import { setImmediate as yieldToEventLoop } from 'timers/promises';
import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import type { Track } from '@shared/types/library';
import { addTracks, readBatchSize } from './add-tracks';
import { storeAlbumArtAccents } from '../art/album-art-accents';
import { createTrackReader, ReadTimeoutError } from '../reading/track-reader';
import { getTracksInside } from '../../repositories/library-repository';
import isSupported, { isSupportedCodec } from '../../utils/is-supported';
import normalizePath from '../../utils/normalize-path';
import { quitSignal, trackScan } from './scan-cancellation';
import { mapAsync } from '@shared/utils/map-async';

const fileReadTimeout = 2000;
/** A file that did not answer in time is asked for again after the others, with time for a drive that has to spin up or a network that was busy */
const retryReadTimeout = 30_000;

/** What tells that a file is the one that was read: its modification time (whole milliseconds) and its exact size */
const statOf = (fileName: string) => fs.promises.stat(fileName).then(({ mtimeMs, size }) => ({ fileModified: Math.floor(mtimeMs), fileSize: size }));

const isUnchanged = (track: Pick<Track, 'fileModified' | 'fileSize'> | undefined, { fileModified, fileSize }: { fileModified: number; fileSize: number }) =>
  track?.fileModified === fileModified && track.fileSize === fileSize;

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

/** The least time between two messages that tell the window to show the tracks stored so far */
const updateInterval = 2000;

/** Collects the tracks to store and writes them a batch at a time; a batch that cannot be written is stored track by track, so one bad track does not take the others with it */
const createBatchWriter = (database: Database, sender: WebContents, size: number, signal: AbortSignal) => {
  let batch: Track[] = [];
  let updatedAt = 0;

  const flush = async () => {
    // a folder removed while its files were read must not get the tracks back
    signal.throwIfAborted();
    const tracks = batch;
    batch = [];
    await addTracks(database, tracks).catch((error) => {
      console.error('Storing a batch of tracks failed, storing them one by one', error);
      return mapAsync(tracks, (track) => addTracks(database, [track]).catch((trackError) => console.error(track.path, trackError)));
    });

    // the lists on the screen show what is stored while the scan goes on, not only at its end
    if (Date.now() - updatedAt < updateInterval) return;
    updatedAt = Date.now();
    sender.send('LIBRARY_UPDATED', {});
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
  const library = await getTracksInside(database, folderPath, ['path', 'fileModified', 'fileSize']);
  const existingTracks = new Map(library.map((track) => [track.path, track]));
  const report = createProgressReporter(sender, folderPath, files.length);
  const reader = createTrackReader();
  const writer = createBatchWriter(database, sender, readBatchSize(), signal);

  // the stat is taken before the read: a file that changes meanwhile differs from it at the next scan, and is read again
  const scanChangedFile = async (fileName: string, timeout: number) => {
    const stat = await statOf(fileName);
    if (isUnchanged(existingTracks.get(normalizePath(fileName)), stat)) return;

    const meta = await reader.read(fileName, global._appDataPath, timeout);
    // a folder removed while the file was read must not get the track back
    signal.throwIfAborted();
    // a file with a codec that does not play stays out of the library, and is read again by the next scan of its folder
    if (!isSupportedCodec(meta.codec)) return;
    await writer.add({ ...meta, ...stat });
  };

  const timedOut: string[] = [];

  const scanFile = async (fileName: string, progress: number) => {
    signal.throwIfAborted();
    report(fileName, progress);

    // the abort is for the loop, which stops at the next file; a failed file is logged and skipped, and one that takes too long is not stored
    await scanChangedFile(fileName, fileReadTimeout).catch((error) => {
      if (signal.aborted) return;
      console.error(fileName, error);
      if (error instanceof ReadTimeoutError) timedOut.push(fileName);
    });
    // yields to the event loop between files, so the server and the window stay responsive during a scan
    await yieldToEventLoop();
  };

  /** Asks again, one at a time, for the files that did not answer; the first that does not answer either ends it, as the drive is probably gone, and returns how many files stay unread */
  const retryTimedOut = async (files: string[]): Promise<number> => {
    const [fileName, ...rest] = files;
    if (!fileName) return 0;

    signal.throwIfAborted();
    const timedOutAgain = await scanChangedFile(fileName, retryReadTimeout).then(
      () => false,
      (error) => {
        if (!signal.aborted) console.error(fileName, error);
        return error instanceof ReadTimeoutError;
      }
    );
    return timedOutAgain ? files.length : retryTimedOut(rest);
  };

  const scanAll = async () => {
    for (const [progress, fileName] of files.entries()) await scanFile(fileName, progress);
    const unread = await retryTimedOut(timedOut);
    await writer.flush();
    // a failure leaves the pictures without a colour, which the next scan or start picks again
    await storeAlbumArtAccents(database).catch((error) => console.error('Picking the colours of the album art failed', error));
    return unread;
  };

  return scanAll().finally(reader.close);
};

/** Scan a defined folder for tracks, and the folders below it unless it is not deep; an aborted signal ends the scan with its error, so the caller does not take the folder for scanned, but a folder that is removed from the library ends it without one. Answers how many files did not answer in time, even when asked again: the folder is not completely scanned then */
const scanFolder = async (folderPath: string, sender: WebContents, deep = true, parent: AbortSignal = quitSignal) => {
  if (!global._database) throw new Error('Database is not connected');
  const { signal, wasRemoved, release } = trackScan(folderPath, parent);

  // shown while the folders are listed, which takes a while on a big drive
  sender.send('SCANNING_FOLDER', { folder: folderPath });

  return scanFiles(folderPath, sender, deep, signal)
    .catch((error) => {
      if (!wasRemoved()) throw error;
      return 0;
    })
    .finally(release);
};

export default scanFolder;
