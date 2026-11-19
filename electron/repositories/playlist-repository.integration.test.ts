import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEntries, createPlaylist, deletePlaylist, getPlaylists, movedTo, moveEntry, movePlaylist, removeEntry, renamePlaylist } from './playlist-repository';
import { createTestDatabase } from '../test-database';

const track = (name: string) => ({ path: `/music/${name}.flac`, snapshot: { path: `/music/${name}.flac`, title: name } });

describe('movedTo', () => {
  it.each([
    [[1, 2, 3], 1, 2, [2, 3, 1]],
    [[1, 2, 3], 3, 0, [3, 1, 2]],
    [[1, 2, 3], 2, 99, [1, 3, 2]],
    [[1, 2, 3], 2, -4, [2, 1, 3]],
    [[1, 2, 3], 9, 0, [1, 2, 3]],
  ])('moves %j: %i to %i gives %j', (ids, id, toIndex, expected) => {
    expect(movedTo(ids, id, toIndex)).toEqual(expected);
  });
});

describe('playlistRepository', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('has no playlists before one is created', async () => {
    expect(await getPlaylists(await createTestDatabase())).toEqual([]);
  });

  it('lists the playlists in the order they were created in, with their tracks in the order they were added in', async () => {
    const database = await createTestDatabase();
    vi.setSystemTime(1);
    const first = await createPlaylist(database, 'Road');
    vi.setSystemTime(2);
    const second = await createPlaylist(database, 'Night');

    await addEntries(database, first, [track('b'), track('a')]);
    await addEntries(database, second, [track('c')]);
    await addEntries(database, first, [track('d')]);

    expect((await getPlaylists(database)).map(({ id, name, entries }) => [id, name, entries.map(({ snapshot }) => snapshot)])).toEqual([
      [first, 'Road', [track('b').snapshot, track('a').snapshot, track('d').snapshot]],
      [second, 'Night', [track('c').snapshot]],
    ]);
  });

  it('keeps the same track twice as two entries', async () => {
    const database = await createTestDatabase();
    const id = await createPlaylist(database, 'Loop');

    await addEntries(database, id, [track('a'), track('a')]);

    const [{ entries }] = await getPlaylists(database);
    expect(entries.map(({ path }) => path)).toEqual(['/music/a.flac', '/music/a.flac']);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
  });

  it('adds nothing to a playlist that is not there', async () => {
    const database = await createTestDatabase();

    await addEntries(database, 42, [track('a')]);
    const id = await createPlaylist(database, 'Real');

    expect((await getPlaylists(database)).flatMap(({ entries }) => entries)).toEqual([]);
    expect(id).toBeGreaterThan(0);
  });

  it('renames a playlist', async () => {
    const database = await createTestDatabase();
    const id = await createPlaylist(database, 'Old');

    await renamePlaylist(database, id, 'New');

    expect((await getPlaylists(database)).map(({ name }) => name)).toEqual(['New']);
  });

  it('deletes a playlist with its entries and leaves the others', async () => {
    const database = await createTestDatabase();
    const doomed = await createPlaylist(database, 'Doomed');
    const kept = await createPlaylist(database, 'Kept');
    await addEntries(database, doomed, [track('a')]);
    await addEntries(database, kept, [track('b')]);

    await deletePlaylist(database, doomed);

    expect((await getPlaylists(database)).map(({ id, entries }) => [id, entries.length])).toEqual([[kept, 1]]);
  });

  it('moves a playlist and keeps the order for the ones created later', async () => {
    const database = await createTestDatabase();
    const [a, b, c] = [await createPlaylist(database, 'A'), await createPlaylist(database, 'B'), await createPlaylist(database, 'C')];

    await movePlaylist(database, c, 0);
    const d = await createPlaylist(database, 'D');

    expect((await getPlaylists(database)).map(({ id }) => id)).toEqual([c, a, b, d]);
  });

  it('removes one entry of a playlist and no entry of another', async () => {
    const database = await createTestDatabase();
    const id = await createPlaylist(database, 'P');
    const other = await createPlaylist(database, 'Q');
    await addEntries(database, id, [track('a'), track('b')]);
    const [{ entries }] = await getPlaylists(database);

    await removeEntry(database, other, entries[0].id);
    await removeEntry(database, id, entries[0].id);

    expect((await getPlaylists(database))[0].entries.map(({ path }) => path)).toEqual(['/music/b.flac']);
  });

  it('moves an entry inside a playlist', async () => {
    const database = await createTestDatabase();
    const id = await createPlaylist(database, 'P');
    await addEntries(database, id, [track('a'), track('b'), track('c')]);
    const [{ entries }] = await getPlaylists(database);

    await moveEntry(database, id, entries[2].id, 0);
    await addEntries(database, id, [track('d')]);

    expect((await getPlaylists(database))[0].entries.map(({ path }) => path.slice(7, 8))).toEqual(['c', 'a', 'b', 'd']);
  });
});
