import { parseFile } from 'music-metadata';
import type { IAudioMetadata, IPicture } from 'music-metadata';
import readAudioFormat from './readAudioFormat';
import readLoudness from './readLoudness';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { setImmediate as yieldToEventLoop } from 'timers/promises';
import slugify from 'slugify';
import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import type { Track } from '../types/library';
import addTrack from './addTrack';
import { getTracksInside } from './libraryRepository';
import isSupported from './isSupported';
import { quitSignal, trackScan } from './scanCancellation';

const fileReadTimeout = 2000;

const normalizePath = (filePath?: string) => (filePath || '').replace(/\\/g, '/');

const ignoreExisting = (error: unknown) => {
  if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
};

const parsePicture = (picture: IPicture, album: string, appDataPath: string): string | null => {
  const extension = picture.format.replace(/^image\//, '').replace(/^jpeg$/, 'jpg');
  if (!extension) return null;

  const folderPath = path.resolve(appDataPath, `./albumart/`);
  const fileHash = crypto.createHash('md5').update(Buffer.from(picture.data).toString('base64')).digest('hex');
  const slug = slugify(album, { remove: /[*+~./()'",!:@\\]/g, lower: true });
  const filePath = path.resolve(folderPath, `./${slug}-${fileHash}.${extension}`);

  fs.mkdirSync(folderPath, { recursive: true });
  // the wx flag fails when the file exists, so there is no gap between the check and the write
  try {
    fs.writeFileSync(filePath, picture.data, { flag: 'wx' });
  } catch (error) {
    ignoreExisting(error);
  }

  return path.basename(filePath);
};

const transformMeta = ({ common: metadata, format, native }: IAudioMetadata, fileName: string, appDataPath: string): Track => ({
  path: normalizePath(fileName),
  artist: metadata.artist || '',
  albumArtist: metadata.albumartist || '',
  album: metadata.album ? `${metadata.album}` : '',
  title: metadata.title || '',
  year: metadata.year || '',
  track: (metadata.track && metadata.track.no) || '',
  disk: (metadata.disk && metadata.disk.no) || '',
  genre: (metadata.genre && metadata.genre[0]) || '',
  picture: metadata.picture && metadata.picture[0] ? parsePicture(metadata.picture[0], metadata.album || '', appDataPath) : null,
  duration: format.duration ?? null,
  ...readAudioFormat(format),
  ...readLoudness(metadata, native),
});

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

/** Store the tags of a file, unless the library holds them already; a file that takes too long to read is not stored */
const writeMeta = async (fileName: string, existingTracks: Map<string, Track>, database: Database, appDataPath: string, scanSignal: AbortSignal) => {
  const timeout = AbortSignal.timeout(fileReadTimeout);
  const timedOut = new Promise<never>((_, reject) => {
    timeout.addEventListener('abort', () => reject(new Error(`File access timeout ${fileName}`)), { once: true });
  });

  const store = async () => {
    const meta = transformMeta(await parseFile(fileName), fileName, appDataPath);
    timeout.throwIfAborted();
    // a folder removed while the file was read must not get the track back
    scanSignal.throwIfAborted();

    const existingTrack = existingTracks.get(meta.path);
    if (!existingTrack || !isEqual(existingTrack, meta)) await addTrack(database, meta);
  };

  await Promise.race([store(), timedOut]);
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

const scanFiles = async (folderPath: string, sender: WebContents, deep: boolean, signal: AbortSignal) => {
  const database = global._database;
  if (!database) throw new Error('Database is not connected');

  const files = (await findFiles(folderPath, deep)).sort();
  signal.throwIfAborted();
  const library = await getTracksInside(database, folderPath);
  const existingTracks = new Map(library.map((track) => [track.path, track]));
  const report = createProgressReporter(sender, folderPath, files.length);

  const scanFile = async (fileName: string, progress: number) => {
    signal.throwIfAborted();
    report(fileName, progress);

    // the abort is for the loop, which stops at the next file; a failed file is logged and skipped
    await writeMeta(fileName, existingTracks, database, global._appDataPath, signal).catch((error) => !signal.aborted && console.error(fileName, error));
    // yields to the event loop between files, so the server and the window stay responsive during a scan
    await yieldToEventLoop();
  };

  for (const [progress, fileName] of files.entries()) await scanFile(fileName, progress);
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
