import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHistory, getHistory, historyLimit, recordPlayed } from './historyRepository';
import { createTestDatabase } from './test-database';

const track = { source: 'local', kind: 'track', id: '/music/a.flac' };
const station = { source: 'radio', kind: 'station', id: 'abc-1' };

describe('historyRepository', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('has no history before something is played', async () => {
    expect(await getHistory(await createTestDatabase())).toEqual([]);
  });

  it('lists what was played of every source with its snapshot, the last played first', async () => {
    const database = await createTestDatabase();

    vi.setSystemTime(1);
    await recordPlayed(database, track, { title: 'A' });
    vi.setSystemTime(2);
    await recordPlayed(database, station, { name: 'Jazz FM' });

    expect(await getHistory(database)).toEqual([
      { ...station, snapshot: { name: 'Jazz FM' }, playedAt: 2 },
      { ...track, snapshot: { title: 'A' }, playedAt: 1 },
    ]);
  });

  it('moves an item that is played again to the top, once, with its new snapshot', async () => {
    const database = await createTestDatabase();

    vi.setSystemTime(1);
    await recordPlayed(database, track, { title: 'Old' });
    vi.setSystemTime(2);
    await recordPlayed(database, station, {});
    vi.setSystemTime(3);
    await recordPlayed(database, track, { title: 'New' });

    expect(await getHistory(database)).toEqual([
      { ...track, snapshot: { title: 'New' }, playedAt: 3 },
      { ...station, snapshot: {}, playedAt: 2 },
    ]);
  });

  it('keeps the same id of different sources and kinds apart', async () => {
    const database = await createTestDatabase();

    vi.setSystemTime(1);
    await recordPlayed(database, track, {});
    vi.setSystemTime(2);
    await recordPlayed(database, { ...track, kind: 'album' }, {});
    vi.setSystemTime(3);
    await recordPlayed(database, { ...track, source: 'drive:usb' }, {});

    expect(await getHistory(database)).toHaveLength(3);
  });

  it('keeps the latest items and drops the oldest ones over the limit', async () => {
    const database = await createTestDatabase();

    const play = (id: string, time: number) => {
      vi.setSystemTime(time);
      return recordPlayed(database, { ...track, id }, {});
    };
    for (let index = 0; index <= historyLimit; index++) await play(`/${index}.flac`, index);
    await play('/last.flac', historyLimit + 1);

    const history = await getHistory(database);
    expect(history).toHaveLength(historyLimit);
    expect(history[0].id).toBe('/last.flac');
    expect(history.some(({ id }) => id === '/0.flac' || id === '/1.flac')).toBe(false);
  });

  it('clears the history of every source and ignores an empty one', async () => {
    const database = await createTestDatabase();
    vi.setSystemTime(1);
    await recordPlayed(database, track, {});
    vi.setSystemTime(2);
    await recordPlayed(database, station, {});

    await clearHistory(database);
    await clearHistory(database);

    expect(await getHistory(database)).toEqual([]);
  });
});
