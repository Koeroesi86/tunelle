import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import executeQuery from '../database/execute-query';
import { memoryFs } from '../test-memory-fs';
import { fakeDatabase } from '../test-fake-database';
import { createArtistPhotoQueue, findArtistPhoto, getImage, getRecords, maxImageBytes, searchArtistPhotos } from './artist-photos';

vi.mock('fs', () => ({ ...memoryFs.sync, default: { ...memoryFs.sync, promises: memoryFs.promises } }));
vi.mock('../database/execute-query', () => ({ default: vi.fn() }));

const database = fakeDatabase();
const fetchMock = vi.fn();
const json = (body: unknown) => new Response(JSON.stringify(body));
const image = (type = 'image/jpeg', size = 4) => new Response(Buffer.alloc(size, 1), { headers: { 'content-type': type } });
const deezer = (...artists: [string, string][]) => json({ data: artists.map(([name, picture]) => ({ name, picture_big: picture })) });
const photo = 'https://cdn.example/artist/abc/big.jpg';

describe('looking up the photo of an artist', () => {
  beforeEach(() => vi.stubGlobal('fetch', fetchMock.mockReset()));

  it('takes the picture of the artist with the same name, without case, accents or space around it', async () => {
    fetchMock.mockResolvedValueOnce(deezer(['Other', 'https://cdn.example/x.jpg'], ['  BÉLA ', photo])).mockResolvedValueOnce(image());

    const found = await findArtistPhoto('béla');

    expect(found).toMatchObject({ extension: 'jpg' });
    expect(fetchMock.mock.calls[0][0]).toContain('q=b%C3%A9la');
    expect(fetchMock.mock.calls[1][0]).toBe(photo);
  });

  it('finds nothing for a name that no artist has, for an artist without a photo, and for a photo that is not https', async () => {
    fetchMock.mockImplementation(async () =>
      deezer(['Bela', 'https://cdn.example/artist//big.jpg'], ['Bela', 'http://cdn.example/b.jpg'], ['Bela', 'nonsense'])
    );

    expect(await findArtistPhoto('Bela')).toBeUndefined();
    expect(await findArtistPhoto('Nobody')).toBeUndefined();
  });

  it('fails when Deezer refuses with an answer that is a 200, or when the status is not ok', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 4 } }));
    await expect(findArtistPhoto('Bela')).rejects.toThrow('Deezer refused the search');

    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(findArtistPhoto('Bela')).rejects.toThrow('answered 503');
  });

  it('ignores the entries of an answer that are not artists, and an answer that is not an object', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [1, { name: 'Bela' }, { name: 'Bela', picture_big: photo }] }));
    expect(await searchArtistPhotos('Bela')).toEqual([{ name: 'Bela', picture: photo }]);

    fetchMock.mockResolvedValueOnce(json(null));
    expect(await searchArtistPhotos('x')).toEqual([]);
  });

  it('takes an image of a known type that is not empty and not too large', async () => {
    fetchMock
      .mockResolvedValueOnce(image('image/png; charset=x'))
      .mockResolvedValueOnce(image('text/html'))
      .mockResolvedValueOnce(image('image/webp', 0))
      .mockResolvedValueOnce(image('image/jpeg', maxImageBytes + 1));

    expect((await getImage('https://x/1')).extension).toBe('png');
    await expect(getImage('https://x/2')).rejects.toThrow('Not a usable image');
    await expect(getImage('https://x/3')).rejects.toThrow('Not a usable image');
    await expect(getImage('https://x/4')).rejects.toThrow('Not a usable image');
  });
});

describe('the records of the photos', () => {
  beforeEach(() => vi.mocked(executeQuery).mockReset().mockResolvedValue([]));

  it('asks for none without names, and for the names given otherwise', async () => {
    expect(await getRecords(database, [])).toEqual([]);
    expect(executeQuery).not.toHaveBeenCalled();

    await getRecords(database, ['a', 'b']);
    expect(vi.mocked(executeQuery).mock.calls[0][1]).toMatchObject({ variables: ['a', 'b'] });
    expect(vi.mocked(executeQuery).mock.calls[0][1].query).toContain('IN (?, ?)');
  });
});

describe('the queue of lookups', () => {
  const onFound = vi.fn();
  const queue = () => createArtistPhotoQueue({ database, getFolder: () => '/art', onFound });
  const record = (key: string, values = {}) => ({ key, picture: null, checkedAt: Date.now(), manual: 0, ...values });
  const saved = () =>
    vi
      .mocked(executeQuery)
      .mock.calls.filter(([, { query }]) => query.startsWith('INSERT'))
      .map(([, { variables }]) => variables.slice(0, 2));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(Date.UTC(2026, 5, 1));
    vi.stubGlobal('fetch', fetchMock.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    memoryFs.reset();
    onFound.mockReset();
    vi.mocked(executeQuery).mockReset().mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

  const run = async (promise: Promise<void>) => {
    await vi.runAllTimersAsync();
    await promise;
  };

  it('stores the photo of a name and tells that photos were found, and keeps a name without a photo as none', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes('api.deezer') ? (url.includes('Bela') ? deezer(['Bela', photo]) : deezer()) : image()));

    await run(
      queue().enqueue([
        { key: 'bela', name: 'Bela' },
        { key: 'nobody', name: 'Nobody' },
      ])
    );

    const [[, stored], [, none]] = saved().map((variables) => [variables[0], variables[1]]);
    expect(stored).toMatch(/^artist-[0-9a-f]{16}\.jpg$/);
    expect(none).toBeNull();
    expect(memoryFs.sync.readdirSync('/art')).toEqual([stored]);
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it('tells the lists after every ten photos, and once more for the rest', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('api.deezer') ? deezer([decodeURIComponent(new URL(url).searchParams.get('q') ?? ''), photo]) : image()
    );
    const artists = Array.from({ length: 12 }, (_, index) => ({ key: `a${index}`, name: `A${index}` }));

    await run(queue().enqueue(artists));

    expect(onFound).toHaveBeenCalledTimes(2);
  });

  it('skips a name that has an answer: a photo, one the user chose, or a lookup of the last month; and looks a name up again after a month', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([
      record('has', { picture: 'artist-1.jpg' }),
      record('manual', { manual: 1 }),
      record('recent'),
      record('old', { checkedAt: Date.now() - 31 * 24 * 3600_000 }),
    ]);
    fetchMock.mockImplementation(async () => deezer());

    await run(queue().enqueue(['has', 'manual', 'recent', 'old', 'new'].map((key) => ({ key, name: key }))));

    expect(saved().map(([key]) => key)).toEqual(['old', 'new']);
  });

  it('ignores a name without a key or without text', async () => {
    fetchMock.mockImplementation(async () => deezer());
    const photos = queue();

    await run(
      photos.enqueue([
        { key: '', name: 'A' },
        { key: 'b', name: '  ' },
        { key: 'c', name: 'C' },
      ])
    );

    expect(saved().map(([key]) => key)).toEqual(['c']);
  });

  it('stops the run and keeps nothing when a lookup fails, so the names are asked for again', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const photos = queue();

    await run(
      photos.enqueue([
        { key: 'a', name: 'A' },
        { key: 'b', name: 'B' },
      ])
    );
    expect(console.error).toHaveBeenCalled();
    expect(saved()).toEqual([]);

    fetchMock.mockImplementation(async () => deezer());
    await run(photos.enqueue([{ key: 'a', name: 'A' }]));
    expect(saved().map(([key]) => key)).toEqual(['a']);
  });
});
