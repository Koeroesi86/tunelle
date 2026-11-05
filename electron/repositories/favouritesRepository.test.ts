import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFavourite, getFavourites, removeFavourite } from './favouritesRepository';
import { createTestDatabase } from '../test-database';

const track = { source: 'local', kind: 'track', id: '/music/a.flac' };
const station = { source: 'radio', kind: 'station', id: 'abc-1' };

describe('favouritesRepository', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('has no favourites before one is added', async () => {
    expect(await getFavourites(await createTestDatabase())).toEqual([]);
  });

  it('lists the favourites of every source with their snapshot, the newest first', async () => {
    const database = await createTestDatabase();

    vi.setSystemTime(1);
    await addFavourite(database, track, { title: 'A' });
    vi.setSystemTime(2);
    await addFavourite(database, station, { name: 'Jazz FM' });
    vi.setSystemTime(3);
    await addFavourite(database, { source: 'drive:usb', kind: 'track', id: '/a.flac' }, { title: 'B' });

    expect(await getFavourites(database)).toEqual([
      { source: 'drive:usb', kind: 'track', id: '/a.flac', snapshot: { title: 'B' }, addedAt: 3 },
      { ...station, snapshot: { name: 'Jazz FM' }, addedAt: 2 },
      { ...track, snapshot: { title: 'A' }, addedAt: 1 },
    ]);
  });

  it('keeps the first favourite when one is added twice', async () => {
    const database = await createTestDatabase();

    vi.setSystemTime(1);
    await addFavourite(database, track, { title: 'First' });
    vi.setSystemTime(2);
    await addFavourite(database, track, { title: 'Second' });

    expect(await getFavourites(database)).toEqual([{ ...track, snapshot: { title: 'First' }, addedAt: 1 }]);
  });

  it('keeps the same id of different sources and kinds apart', async () => {
    const database = await createTestDatabase();

    vi.setSystemTime(1);
    await addFavourite(database, track, {});
    vi.setSystemTime(2);
    await addFavourite(database, { ...track, kind: 'album' }, {});
    vi.setSystemTime(3);
    await addFavourite(database, { ...track, source: 'drive:usb' }, {});
    await removeFavourite(database, track);

    expect((await getFavourites(database)).map(({ source, kind }) => `${source}/${kind}`)).toEqual(['drive:usb/track', 'local/album']);
  });

  it('removes a favourite and ignores one that is not there', async () => {
    const database = await createTestDatabase();
    vi.setSystemTime(1);
    await addFavourite(database, track, {});

    await removeFavourite(database, station);
    await removeFavourite(database, track);

    expect(await getFavourites(database)).toEqual([]);
  });
});
