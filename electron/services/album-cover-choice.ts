import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite3';
import { mapAsync } from '@shared/utils/map-async';
import executeQuery from '../database/execute-query';
import { albumCoverKey, albumCoverKeyColumn } from '../library/art/album-cover-key';
import { readTrackFile } from '../library/reading/read-track-file';
import { getAlbumTracks } from '../repositories/library-repository';
import { albumCoversRowSchema } from '../schemas/database/album-covers';

/** The prefix of the files of the covers the user chose: the covers of the tags are named by the album, and the photos of the artists by `artist-` */
const prefix = 'cover-';

const previousPicture = (database: Database, key: string) =>
  executeQuery(database, { query: 'SELECT picture FROM album_covers WHERE key = ?', variables: [key] }, albumCoversRowSchema.pick({ picture: true })).then(
    ([row]) => row?.picture ?? undefined
  );

/** Delete a chosen cover and the smaller copy made of it, and forget its colour; the covers of the tags are never deleted */
const removeFiles = async (database: Database, folder: string, picture: string | undefined, keep?: string) => {
  if (!picture?.startsWith(prefix) || picture === keep) return;

  const stem = path.basename(picture, path.extname(picture));
  await Promise.all([picture, `${stem}-optimized.png`].map((file) => fs.promises.rm(path.join(folder, file), { force: true })));
  await executeQuery(database, { query: 'DELETE FROM album_art WHERE picture = ?', variables: [picture] });
};

const setCover = async (database: Database, key: string, picture: string | null) => {
  await executeQuery(database, {
    query: `INSERT INTO album_covers (key, picture) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET picture = excluded.picture`,
    variables: [key, picture],
  });
  await executeQuery(database, { query: `UPDATE library SET picture = ? WHERE ${albumCoverKeyColumn} = ?`, variables: [picture, key] });
};

/** Keep a picked image as the cover of an album; the file is named by what is in it, so a replaced cover is another URL and not the cached one */
export const chooseAlbumCover = async (
  database: Database,
  artFolder: string,
  albumFolder: string,
  title: string,
  { extension, data }: { extension: string; data: Buffer }
) => {
  const key = albumCoverKey(albumFolder, title);
  const previous = await previousPicture(database, key);
  const fileName = `${prefix}${createHash('sha1').update(key).digest('hex').slice(0, 16)}-${createHash('sha1').update(data).digest('hex').slice(0, 12)}.${extension}`;
  const partial = path.join(artFolder, `${fileName}.part`);

  await fs.promises.mkdir(artFolder, { recursive: true });
  await fs.promises.writeFile(partial, data);
  await fs.promises.rename(partial, path.join(artFolder, fileName));
  await setCover(database, key, fileName);
  await removeFiles(database, artFolder, previous, fileName);
  return fileName;
};

/** No cover for an album */
export const removeAlbumCover = async (database: Database, artFolder: string, albumFolder: string, title: string) => {
  const key = albumCoverKey(albumFolder, title);
  const previous = await previousPicture(database, key);
  await setCover(database, key, null);
  await removeFiles(database, artFolder, previous);
  return null;
};

/** Forget the choice, so the tracks have the cover of their tags again (read from the files); the cover of the first track that has one is the one that is returned */
export const resetAlbumCover = async (database: Database, artFolder: string, albumFolder: string, title: string) => {
  const key = albumCoverKey(albumFolder, title);
  const previous = await previousPicture(database, key);
  const tracks = await getAlbumTracks(database, albumFolder, title);
  const read = await mapAsync(tracks, ({ path: file }) =>
    readTrackFile(file, global._appDataPath).then(
      ({ picture }) => ({ file, picture }),
      () => undefined
    )
  );

  await executeQuery(database, { query: 'DELETE FROM album_covers WHERE key = ?', variables: [key] });
  await mapAsync(
    read.filter((item) => item !== undefined),
    ({ file, picture }) => executeQuery(database, { query: 'UPDATE library SET picture = ? WHERE path = ?', variables: [picture, file] })
  );
  await removeFiles(database, artFolder, previous);
  return read.find((item) => item?.picture)?.picture ?? null;
};
