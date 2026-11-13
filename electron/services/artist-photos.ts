import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite3';
import { wait } from '@shared/utils/wait';
import { fetchOk } from './http';
import executeQuery from '../database/execute-query';
import { artistPhotosRowSchema } from '../schemas/database/artist-photos';
import { toSortKey } from '../database/sort-key';
import { z } from 'zod';

export interface ArtistName {
  /** The name as the library compares it */
  key: string;
  name: string;
}

interface PhotoImage {
  extension: string;
  data: Buffer;
}

const lookupTimeout = 5000;
// how long to wait between two lookups, Deezer limits the requests
const lookupGap = 250;

export const maxImageBytes = 2_000_000;
// a name without a match is looked up again after this long, the artist may have a photo by then; a photo the user chose is never looked up
const retryAfter = 1000 * 60 * 60 * 24 * 30;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const searchUrl = (name: string) => `https://api.deezer.com/search/artist?${new URLSearchParams({ q: name, limit: '10' })}`;

const deezerArtistSchema = z.object({ name: z.string(), picture_big: z.string() });

const deezerAnswerSchema = z.object({
  error: z.never().optional(),
  data: z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = deezerArtistSchema.safeParse(item);
        return parsed.success ? [{ name: parsed.data.name, picture: parsed.data.picture_big }] : [];
      })
    ),
});

/** The artists of an answer of the search with the photo they have; Deezer answers a refusal (the quota) with a 200 and an error */
const candidatesOf = (answer: unknown) => {
  const parsed = deezerAnswerSchema.safeParse({ data: [], ...(typeof answer === 'object' ? answer : undefined) });
  if (!parsed.success) throw new Error('Deezer refused the search');

  return parsed.data.data;
};

// an artist without a photo has the URL of a photo without a name in it
const hasPhoto = (url: string) => URL.canParse(url) && new URL(url).protocol === 'https:' && !new URL(url).pathname.includes('/artist//');

const getImage = async (url: string): Promise<PhotoImage> => {
  const response = await fetchOk(url, { timeout: lookupTimeout });
  const extension = extensions[(response.headers.get('content-type') ?? '').split(';')[0].trim()];
  const data = Buffer.from(await response.arrayBuffer());
  if (!extension || data.length === 0 || data.length > maxImageBytes) throw new Error('Not a usable image');

  return { extension, data };
};

/**
 * The photo Deezer has of an artist, undefined when it has none: only an artist with the same name (without case, accents and the space around it)
 * counts, the first search result is not taken for it. A search or a download that fails throws, which is no answer about the artist
 */
export const findArtistPhoto = async (name: string) => {
  const key = toSortKey(name);
  const match = candidatesOf(await (await fetchOk(searchUrl(name), { timeout: lookupTimeout })).json()).find(
    (candidate) => toSortKey(candidate.name) === key && hasPhoto(candidate.picture)
  );

  return match && getImage(match.picture);
};

/** Write the photo of a name into the album art folder, next to the covers; the file name follows from the name */
const storePhoto = async (folder: string, key: string, { extension, data }: PhotoImage) => {
  const fileName = `artist-${createHash('sha1').update(key).digest('hex').slice(0, 16)}.${extension}`;
  const partial = path.join(folder, `${fileName}.part`);

  await fs.promises.mkdir(folder, { recursive: true });
  await fs.promises.writeFile(partial, data);
  await fs.promises.rename(partial, path.join(folder, fileName));
  return fileName;
};

export const getRecords = (database: Database, keys: string[]) =>
  keys.length === 0
    ? Promise.resolve([])
    : executeQuery(
        database,
        { query: `SELECT key, picture, checkedAt, manual FROM artist_photos WHERE key IN (${keys.map(() => '?').join(', ')})`, variables: keys },
        artistPhotosRowSchema
      );

const saveRecord = (database: Database, key: string, picture: string | null, checkedAt: number) =>
  executeQuery(database, {
    query: `INSERT INTO artist_photos (key, picture, checkedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET picture = excluded.picture, checkedAt = excluded.checkedAt WHERE artist_photos.manual = 0`,
    variables: [key, picture, checkedAt],
  });

interface QueueOptions {
  database: Database;
  /** The folder of the album art, read when a photo is stored */
  getFolder: () => string;
  /** Tells that photos were stored, the lists that show them can fetch their covers again */
  onFound: () => void;
}

/** how many photos are found before the lists are told, so they do not fetch again for every one */
const reportEvery = 10;

/**
 * Looks up the photos of the artists it is asked for, one at a time. A name is looked up once: the answer is kept in the library,
 * also when there is no photo (for a month). A lookup that fails stops the run and keeps nothing, the names are asked for again when they are shown
 */
export const createArtistPhotoQueue = ({ database, getFolder, onFound }: QueueOptions) => {
  const queued = new Set<string>();
  const pending: ArtistName[] = [];
  let running: Promise<void> | undefined;

  const lookup = async ({ key, name }: ArtistName) => {
    const image = await findArtistPhoto(name);
    await saveRecord(database, key, image ? await storePhoto(getFolder(), key, image) : null, Date.now());
    return image !== undefined;
  };

  const run = async () => {
    let unreported = 0;

    const lookupNext = async (artist: ArtistName) => {
      unreported += (await lookup(artist)) ? 1 : 0;
      queued.delete(artist.key);
      if (unreported < reportEvery) return;
      onFound();
      unreported = 0;
    };

    const drain = async () => {
      let artist = pending.shift();
      while (artist) {
        await lookupNext(artist);
        await wait(lookupGap);
        artist = pending.shift();
      }
    };

    try {
      await drain();
    } catch (error) {
      console.error(error);
      pending.length = 0;
      queued.clear();
    }
    if (unreported > 0) onFound();
  };

  return {
    /** Look up the photos of the names that have no answer yet; resolves when the run is over */
    enqueue: async (artists: ArtistName[]) => {
      const fresh = artists.filter(({ key, name }) => key && name.trim() && !queued.has(key));
      fresh.forEach(({ key }) => queued.add(key));

      const records = new Map(
        (
          await getRecords(
            database,
            fresh.map(({ key }) => key)
          )
        ).map((record) => [record.key, record])
      );
      const due = fresh.filter(({ key }) => {
        const record = records.get(key);
        return !record || (!record.manual && !record.picture && record.checkedAt < Date.now() - retryAfter);
      });
      fresh.filter((artist) => !due.includes(artist)).forEach(({ key }) => queued.delete(key));

      pending.push(...due);
      if (due.length > 0) running ??= run().finally(() => (running = undefined));
      await running;
    },
  };
};
