import path from 'path';
import sharp from 'sharp';
import type { Database } from 'sqlite3';
import { pickAccent } from '@shared/utils/pick-accent';
import executeQuery from '../../database/execute-query';
import { sampleSize } from '@shared/constants/accent';
import { getAlbumArtFolder } from '../../utils/album-art-folder';
import { mapAsync } from '@shared/utils/map-async';

/** Pictures written to the table in one statement, so a long run is saved as it goes */
const chunkSize = 100;

/** The main colour of a picture as `#rrggbb`, empty when it has none; a file that cannot be read has none either, as a picture never changes under its name */
const readAccent = async (picture: string) => {
  const file = path.join(getAlbumArtFolder(global._appDataPath), picture);

  return sharp(file)
    .resize(sampleSize, sampleSize, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer()
    .then((pixels) => pickAccent(pixels) ?? '')
    .catch((error) => {
      console.error(`The colour of ${picture} cannot be read`, error);
      return '';
    });
};

const storeChunk = async (database: Database, pictures: string[]) => {
  const accents = await Promise.all(pictures.map(readAccent));

  await executeQuery(database, {
    query: `INSERT OR REPLACE INTO album_art (picture, accent) VALUES ${pictures.map(() => '(?, ?)').join(', ')}`,
    variables: pictures.flatMap((picture, index) => [picture, accents[index]]),
  });
};

/** Picks and stores the colour of every album picture that has none yet: the pictures of a scan, and those of a library from before the colours were kept; nothing is done once every picture has one */
export const storeAlbumArtAccents = async (database: Database) => {
  const rows = await executeQuery<{ picture: string }>(database, {
    query: `SELECT DISTINCT picture FROM library WHERE COALESCE(picture, '') <> '' AND picture NOT IN (SELECT picture FROM album_art)`,
    variables: [],
  });
  const pictures = rows.map((row) => row.picture);

  const chunks = Array.from({ length: Math.ceil(pictures.length / chunkSize) }, (_, index) => pictures.slice(index * chunkSize, (index + 1) * chunkSize));
  await mapAsync(chunks, (chunk) => storeChunk(database, chunk));
};

/** The colour of each picture of a list that has one, by the name of the picture */
export const getAlbumArtAccents = async (database: Database, pictures: (string | null)[]) => {
  const names = Array.from(new Set(pictures.filter((picture): picture is string => !!picture)));
  if (names.length === 0) return new Map<string, string>();

  const rows = await executeQuery<{ picture: string; accent: string }>(database, {
    query: `SELECT picture, accent FROM album_art WHERE accent <> '' AND picture IN (${names.map(() => '?').join(', ')})`,
    variables: names,
  });
  return new Map(rows.map((row) => [row.picture, row.accent]));
};

/** The colour stored for the picture an optimized cover was made from (`name-hash-optimized.png` of `name-hash.jpg`): empty when the picture has none, undefined when it is not looked at yet */
export const getCoverAccent = async (database: Database, optimized: string) => {
  const name = optimized.replace(/-optimized\.[^.]*$/, '').replace(/[!%_]/g, '!$&');
  const [row] = await executeQuery<{ accent: string }>(database, {
    query: `SELECT accent FROM album_art WHERE picture LIKE ? ESCAPE '!' LIMIT 1`,
    variables: [`${name}.%`],
  });
  return row?.accent;
};
