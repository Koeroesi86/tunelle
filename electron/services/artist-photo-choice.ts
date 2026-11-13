import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite3';
import type { ArtistPhotoFailure } from '@shared/types/artist-photo';
import executeQuery from '../database/execute-query';
import { getRecords, maxImageBytes } from './artist-photos';

type PhotoFile = { image: { extension: string; data: Buffer } } | { reason: ArtistPhotoFailure };

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);

/** The kind of image by its first bytes, as the name of a file says nothing sure; undefined for anything but a JPEG, a PNG or a WebP */
const extensionOf = (data: Buffer) => {
  if (data.subarray(0, 3).equals(jpegSignature)) return 'jpg';
  if (data.subarray(0, 8).equals(pngSignature)) return 'png';
  return data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP' ? 'webp' : undefined;
};

const readWithin = async (handle: fs.promises.FileHandle) => {
  const { size } = await handle.stat();
  return size > maxImageBytes ? ('tooLarge' as const) : handle.readFile();
};

/** The image in a file the user picked, or why it cannot be used: the file is opened once, so the size that is checked is the one that is read */
export const readPhotoFile = async (filePath: string): Promise<PhotoFile> => {
  const handle = await fs.promises.open(filePath, 'r').catch(() => undefined);
  if (!handle) return { reason: 'unreadable' };

  const data = await readWithin(handle)
    .catch(() => 'unreadable' as const)
    .finally(() => handle.close());
  if (typeof data === 'string') return { reason: data };
  if (data.length > maxImageBytes) return { reason: 'tooLarge' };

  const extension = extensionOf(data);
  return extension ? { image: { extension, data } } : { reason: 'notImage' };
};

const keyHash = (key: string) => createHash('sha1').update(key).digest('hex').slice(0, 16);

const previousPicture = async (database: Database, key: string) => (await getRecords(database, [key]))[0]?.picture ?? undefined;

/** Delete a photo and the smaller copy made of it; only a file of the photos, and only that one (the photo of a lookup has a name that starts the same way) */
const removeFiles = async (folder: string, picture: string | undefined, keep?: string) => {
  if (!picture?.startsWith('artist-') || picture === keep) return;

  const stem = path.basename(picture, path.extname(picture));
  await Promise.all([picture, `${stem}-optimized.png`].map((file) => fs.promises.rm(path.join(folder, file), { force: true })));
};

const saveManual = (database: Database, key: string, picture: string | null) =>
  executeQuery(database, {
    query: `INSERT INTO artist_photos (key, picture, checkedAt, manual) VALUES (?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET picture = excluded.picture, checkedAt = excluded.checkedAt, manual = 1`,
    variables: [key, picture, Date.now()],
  });

/** Keep a picked image as the photo of a name; the file is named by what is in it, so a replaced photo is another URL and not the cached one */
export const chooseArtistPhoto = async (database: Database, folder: string, key: string, { extension, data }: { extension: string; data: Buffer }) => {
  const previous = await previousPicture(database, key);
  const fileName = `artist-${keyHash(key)}-${createHash('sha1').update(data).digest('hex').slice(0, 12)}.${extension}`;
  const partial = path.join(folder, `${fileName}.part`);

  await fs.promises.mkdir(folder, { recursive: true });
  await fs.promises.writeFile(partial, data);
  await fs.promises.rename(partial, path.join(folder, fileName));
  await saveManual(database, key, fileName);
  await removeFiles(folder, previous, fileName);
};

/** No photo for a name, which then shows the cover of an album; it is not looked up */
export const removeArtistPhoto = async (database: Database, folder: string, key: string) => {
  const previous = await previousPicture(database, key);
  await saveManual(database, key, null);
  await removeFiles(folder, previous);
};

/** Forget what is known of the photo of a name, so it is looked up as if it was new (when the lookup is on) */
export const resetArtistPhoto = async (database: Database, folder: string, key: string) => {
  const previous = await previousPicture(database, key);
  await executeQuery(database, { query: 'DELETE FROM artist_photos WHERE key = ?', variables: [key] });
  await removeFiles(folder, previous);
};
