import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sqlite3';
import { createArtistPhotoQueue, findArtistPhoto, searchArtistPhotos } from './artist-photos';
import executeQuery from '../database/execute-query';
import { createTestDatabase } from '../test-database';

const photoUrl = (name: string) => `https://cdn-images.dzcdn.net/images/artist/${name}/500x500-000000-80-0-0.jpg`;
const answer = (data: object[]) => Response.json({ data });
const image = (type = 'image/jpeg', bytes = 'jpeg') => new Response(bytes, { headers: { 'Content-Type': type } });

/** Deezer as the global fetch: the search answers with the artists given, any other URL is a photo */
const deezer = (artists: Record<string, { name: string; picture_big: string }[]>) =>
  stubFetch(async (url: string) => {
    const { pathname, searchParams } = new URL(url);
    return pathname === '/search/artist' ? answer(artists[searchParams.get('q') ?? ''] ?? []) : image();
  });

/** The fake clock moves on while the queue waits between two lookups, so a time is checked to within five seconds */
const around = (time: number) => expect.closeTo(time, -4);

const stubFetch = (fetcher: (url: string) => Promise<Response>) => {
  const mock = vi.fn(fetcher);
  vi.stubGlobal('fetch', mock);
  return mock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findArtistPhoto', () => {
  it('takes the photo of the artist with the same name, not the first result', async () => {
    const fetcher = deezer({
      ' bjork ': [
        { name: 'Bjork Tribute', picture_big: photoUrl('wrong') },
        { name: 'Björk', picture_big: photoUrl('right') },
      ],
    });

    const photo = await findArtistPhoto(' bjork ');

    expect(photo).toEqual({ extension: 'jpg', data: Buffer.from('jpeg') });
    expect(fetcher).toHaveBeenLastCalledWith(photoUrl('right'), expect.anything());
  });

  it('finds nothing when no artist has the name, or the one that has it has no photo', async () => {
    deezer({
      Other: [{ name: 'Someone', picture_big: photoUrl('x') }],
      Plain: [{ name: 'Plain', picture_big: 'https://cdn-images.dzcdn.net/images/artist//500x500-000000-80-0-0.jpg' }],
    });

    expect(await findArtistPhoto('Other')).toBeUndefined();
    expect(await findArtistPhoto('Plain')).toBeUndefined();
    expect(await findArtistPhoto('Unknown')).toBeUndefined();
  });

  it('fails, and finds no answer about the artist, on a refusal, an error status or something that is not an image', async () => {
    const found = { Adam: [{ name: 'Adam', picture_big: photoUrl('a') }] };

    stubFetch(async () => Response.json({ error: { code: 4, message: 'Quota limit exceeded' } }));
    await expect(findArtistPhoto('Adam')).rejects.toThrow('refused');

    stubFetch(async () => new Response(undefined, { status: 503 }));
    await expect(findArtistPhoto('Adam')).rejects.toThrow('503');

    stubFetch(async (url) => (url.includes('/search/') ? answer(found.Adam) : image('text/html', '<html>')));
    await expect(findArtistPhoto('Adam')).rejects.toThrow('Not a usable image');
  });
});

describe('searchArtistPhotos', () => {
  it('lists the artists with a photo that Deezer finds for a text, whatever they are called', async () => {
    const fetcher = deezer({
      'ad dam': [
        { name: 'Adam', picture_big: photoUrl('a') },
        { name: 'Without', picture_big: 'https://cdn-images.dzcdn.net/images/artist//500x500-000000-80-0-0.jpg' },
        { name: 'Adam Two', picture_big: photoUrl('b') },
      ],
    });

    expect(await searchArtistPhotos('ad dam')).toEqual([
      { name: 'Adam', picture: photoUrl('a') },
      { name: 'Adam Two', picture: photoUrl('b') },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails when Deezer refuses or cannot answer', async () => {
    stubFetch(async () => Response.json({ error: { code: 4 } }));
    await expect(searchArtistPhotos('Adam')).rejects.toThrow('refused');

    stubFetch(async () => new Response(undefined, { status: 503 }));
    await expect(searchArtistPhotos('Adam')).rejects.toThrow('503');
  });
});

describe('createArtistPhotoQueue', () => {
  let database: Database;
  let folder: string;
  let clock: number;
  const onFound = vi.fn();
  const records = () =>
    executeQuery<{ key: string; picture: string | null; checkedAt: number; manual: number }>(database, {
      query: 'SELECT * FROM artist_photos ORDER BY key',
      variables: [],
    });
  /** The queue waits between two lookups, which the fake clock passes at once while the database answers in real time */
  const queueOf = () => {
    const queue = createArtistPhotoQueue({ database, getFolder: () => folder, onFound });
    return {
      enqueue: async (artists: { key: string; name: string }[]) => {
        let done = false;
        const run = queue.enqueue(artists).finally(() => (done = true));
        // the database answers in real time, so the clock moves by one gap only when the queue waits for it
        while (!done) {
          await new Promise((resolve) => setImmediate(resolve));
          await vi.advanceTimersByTimeAsync(vi.getTimerCount() > 0 ? 250 : 0);
        }
        await run;
      },
    };
  };
  const adam = { key: 'adam', name: 'Adam' };
  const found = { Adam: [{ name: 'Adam', picture_big: photoUrl('a') }] };

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    database = await createTestDatabase();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-photos-'));
    clock = 1_000_000;
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(clock);
    onFound.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('stores the photo next to the covers, remembers it and tells the lists', async () => {
    deezer(found);
    await queueOf().enqueue([adam]);

    const [record] = await records();
    expect(record).toMatchObject({ key: 'adam', checkedAt: around(clock) });
    expect(record.picture).toMatch(/^artist-[0-9a-f]{16}\.jpg$/);
    expect(fs.readFileSync(path.join(folder, record.picture ?? ''), 'utf8')).toBe('jpeg');
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it('remembers a name without a photo, and does not look it up again before a month has passed', async () => {
    const fetcher = deezer({});
    const queue = queueOf();

    await queue.enqueue([adam]);
    await queue.enqueue([adam]);
    expect(await records()).toEqual([{ key: 'adam', picture: null, checkedAt: around(clock), manual: 0 }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onFound).not.toHaveBeenCalled();

    clock += 1000 * 60 * 60 * 24 * 31;
    vi.setSystemTime(clock);
    await queue.enqueue([adam]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never looks up a name whose photo the user chose or removed, however old the record is', async () => {
    const fetcher = deezer(found);
    await executeQuery(database, { query: "INSERT INTO artist_photos (key, picture, checkedAt, manual) VALUES ('adam', NULL, 1, 1)", variables: [] });
    clock += 1000 * 60 * 60 * 24 * 365;
    vi.setSystemTime(clock);

    await queueOf().enqueue([adam]);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the photo the user chose while a lookup of the name is on', async () => {
    const chosen = "INSERT OR REPLACE INTO artist_photos (key, picture, checkedAt, manual) VALUES ('adam', 'artist-chosen.png', 1, 1)";
    stubFetch(async (url: string) => {
      await executeQuery(database, { query: chosen, variables: [] });
      return new URL(url).pathname === '/search/artist' ? answer(found.Adam) : image();
    });

    await queueOf().enqueue([adam]);

    expect(await records()).toEqual([{ key: 'adam', picture: 'artist-chosen.png', checkedAt: 1, manual: 1 }]);
  });

  it('does not look up a name that has its photo already, or no name at all', async () => {
    const fetcher = deezer(found);
    const queue = queueOf();
    await queue.enqueue([adam]);
    fetcher.mockClear();

    await queue.enqueue([adam, { key: '', name: '' }, { key: 'blank', name: '  ' }]);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('looks a name up once when it is asked for again while the run is on', async () => {
    const fetcher = deezer(found);
    const queue = queueOf();

    await Promise.all([queue.enqueue([adam]), queue.enqueue([adam])]);

    expect(fetcher.mock.calls.filter(([url]) => url.includes('/search/'))).toHaveLength(1);
  });

  it('stops at a lookup that fails, keeps nothing of it and tries the names again when they are asked for', async () => {
    const fetcher = deezer(found);
    fetcher.mockRejectedValueOnce(new Error('offline'));
    const queue = queueOf();

    await queue.enqueue([adam, { key: 'bea', name: 'Bea' }]);
    expect(await records()).toEqual([]);
    expect(console.error).toHaveBeenCalled();

    await queue.enqueue([adam]);
    expect(await records()).toEqual([expect.objectContaining({ key: 'adam' })]);
  });

  it('tells the lists after every ten photos and when the run is over', async () => {
    const names = Array.from({ length: 12 }, (_, index) => ({ key: `a${index}`, name: `A${index}` }));
    deezer(Object.fromEntries(names.map(({ name }) => [name, [{ name, picture_big: photoUrl(name) }]])));

    await queueOf().enqueue(names);

    expect(onFound).toHaveBeenCalledTimes(2);
  });
});
