import { parseFile } from 'music-metadata';
import type { IAudioMetadata, IPicture } from 'music-metadata';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import slugify from 'slugify';
import type { Track } from '../types/library';
import readAudioFormat from './readAudioFormat';
import readLoudness from './readLoudness';

const normalizePath = (filePath?: string) => (filePath || '').replace(/\\/g, '/');

const hasCode = (error: unknown, code: string) => error instanceof Error && 'code' in error && error.code === code;

const ignoreExisting = (error: unknown, whenFolderIsGone: () => void) => {
  if (hasCode(error, 'ENOENT')) return whenFolderIsGone();
  if (!hasCode(error, 'EEXIST')) throw error;
};

const albumArtFolders = new Set<string>();

/** The wx flag fails when the file exists, so there is no gap between the check and the write; the folder is made once for each process, and again when it is gone (the user cleared it while the app ran) */
const writePicture = (folderPath: string, filePath: string, data: Uint8Array) => {
  if (!albumArtFolders.has(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    albumArtFolders.add(folderPath);
  }

  try {
    fs.writeFileSync(filePath, data, { flag: 'wx' });
  } catch (error) {
    // the folder is gone, so it is made again; a file that exists is the picture already
    ignoreExisting(error, () => {
      albumArtFolders.delete(folderPath);
      writePicture(folderPath, filePath, data);
    });
  }
};

const parsePicture = (picture: IPicture, album: string, appDataPath: string): string | null => {
  const extension = picture.format.replace(/^image\//, '').replace(/^jpeg$/, 'jpg');
  if (!extension) return null;

  const folderPath = path.resolve(appDataPath, `./albumart/`);
  const fileHash = crypto.createHash('md5').update(Buffer.from(picture.data).toString('base64')).digest('hex');
  const slug = slugify(album, { remove: /[*+~./()'",!:@\\]/g, lower: true });
  const filePath = path.resolve(folderPath, `./${slug}-${fileHash}.${extension}`);

  writePicture(folderPath, filePath, picture.data);

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

/** Read the tags of a file and write its picture into the album art folder of the app data */
export const readTrackFile = async (fileName: string, appDataPath: string): Promise<Track> => transformMeta(await parseFile(fileName), fileName, appDataPath);
