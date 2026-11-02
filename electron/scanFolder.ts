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
import { quitSignal } from './scanCancellation';

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

  for (const entry of entries) found.push(...(await findEntryFiles(directory, entry, deep)));

  return found;
};

/** Store the tags of a file, unless the library holds them already; a file that takes too long to read is not stored */
const writeMeta = async (fileName: string, existingTracks: Map<string, Track>, database: Database, appDataPath: string) => {
  const timeout = AbortSignal.timeout(fileReadTimeout);
  const timedOut = new Promise<never>((_, reject) => {
    timeout.addEventListener('abort', () => reject(new Error(`File access timeout ${fileName}`)), { once: true });
  });

  const store = async () => {
    const meta = transformMeta(await parseFile(fileName), fileName, appDataPath);
    timeout.throwIfAborted();

    const existingTrack = existingTracks.get(meta.path);
    if (!existingTrack || !isEqual(existingTrack, meta)) await addTrack(database, meta);
  };

  await Promise.race([store(), timedOut]);
};

/** Scan a defined folder for tracks, and the folders below it unless it is not deep; an aborted signal ends the scan with its error, so the caller does not take the folder for scanned */
const scanFolder = async (folderPath: string, sender: WebContents, deep = true, signal: AbortSignal = quitSignal) => {
  if (!global._database) throw new Error('Database is not connected');
  const database = global._database;
  const appDataPath = global._appDataPath;

  const files = (await findFiles(folderPath, deep)).sort();
  signal.throwIfAborted();
  const library = await getTracksInside(database, folderPath);
  const existingTracks = new Map(library.map((track) => [track.path, track]));
  let currentFolder = folderPath;

  const scanFile = async (fileName: string, progress: number) => {
    signal.throwIfAborted();
    const folder = path.dirname(fileName);
    if (folder !== currentFolder) sender.send('SCANNING_FOLDER', { folder });
    currentFolder = folder;

    sender.send('SCANNING_FILE', { fileName, progress, totalCount: files.length });
    await writeMeta(fileName, existingTracks, database, appDataPath).catch((error) => console.error(fileName, error));
    // yields to the event loop between files, so the server and the window stay responsive during a scan
    await yieldToEventLoop();
  };

  for (const [progress, fileName] of files.entries()) await scanFile(fileName, progress);
};

export default scanFolder;
