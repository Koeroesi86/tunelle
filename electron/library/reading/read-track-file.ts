import { parseFile } from 'music-metadata';
import type { IAudioMetadata, IPicture } from 'music-metadata';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import slugify from 'slugify';
import type { Track } from '@shared/types/library';
import readAudioFormat from './read-audio-format';
import type { ReadFormat } from './read-audio-format';
import { readDstDuration } from './read-dst-duration';
import { readLargeWave } from './read-large-wave';
import type { LargeWave } from './read-large-wave';
import readLoudness from './read-loudness';
import normalizePath from '../../utils/normalize-path';
import { getAlbumArtFolder } from '../../utils/album-art-folder';
import { hasErrorCode } from '@shared/utils/has-error-code';

const ignoreExisting = (error: unknown, whenFolderIsGone: () => void) => {
  if (hasErrorCode(error, 'ENOENT')) return whenFolderIsGone();
  if (!hasErrorCode(error, 'EEXIST')) throw error;
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

  const folderPath = path.resolve(getAlbumArtFolder(appDataPath));
  const fileHash = crypto.createHash('md5').update(Buffer.from(picture.data).toString('base64')).digest('hex');
  const slug = slugify(album, { remove: /[*+~./()'",!:@\\]/g, lower: true });
  const filePath = path.resolve(folderPath, `./${slug}-${fileHash}.${extension}`);

  writePicture(folderPath, filePath, picture.data);

  return path.basename(filePath);
};

/** What a track is made of: the tags and the format of a file, which a Wave64 or RF64 file has only in part */
interface ReadMeta {
  common: Partial<IAudioMetadata['common']>;
  format: ReadFormat & Pick<IAudioMetadata['format'], 'duration'>;
  native: IAudioMetadata['native'];
}

const transformMeta = ({ common: metadata, format, native }: ReadMeta, fileName: string, appDataPath: string): Track => ({
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

const withoutNative = (wave: LargeWave): ReadMeta => ({ ...wave, native: {} });

const readWave64 = async (fileName: string): Promise<ReadMeta> => {
  const wave = await readLargeWave(fileName);
  if (!wave) throw new Error(`${fileName} is not a Wave64 file`);
  return withoutNative(wave);
};

/** `music-metadata` skips the sound chunk of a DST file, so its length is read from the file. See docs/app/supported-formats.md */
const withDstDuration = async (fileName: string, meta: IAudioMetadata): Promise<ReadMeta> => {
  if (!/^dst/i.test(meta.format.codec ?? '')) return meta;
  return { ...meta, format: { ...meta.format, duration: await readDstDuration(fileName) } };
};

/** Wave64 and RF64 files are read by `readLargeWave`, as `music-metadata` reads neither: it fails on the first and finds no format in the second. See docs/app/supported-formats.md */
const readMeta = async (fileName: string): Promise<ReadMeta> => {
  if (path.extname(fileName).toLowerCase() === '.w64') return readWave64(fileName);
  const meta = await parseFile(fileName);
  if (meta.format.codec) return withDstDuration(fileName, meta);
  const wave = await readLargeWave(fileName);
  return wave ? withoutNative(wave) : meta;
};

/** Read the tags of a file and write its picture into the album art folder of the app data */
export const readTrackFile = async (fileName: string, appDataPath: string): Promise<Track> => transformMeta(await readMeta(fileName), fileName, appDataPath);
