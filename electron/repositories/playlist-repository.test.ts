import { beforeEach, describe, expect, it, vi } from 'vitest';
import executeQuery from '../database/execute-query';
import { fakeDatabase } from '../test-fake-database';
import {
  addEntries,
  createImportedPlaylist,
  createPlaylist,
  deletePlaylist,
  getImportedPlaylists,
  getPlaylistNames,
  getPlaylists,
  markPlaylistWritten,
  movedTo,
  moveEntry,
  movePlaylist,
  relinkPlaylistFile,
  removeEntry,
  renamePlaylist,
  replaceImportedEntries,
  setEncodingOverride,
  setPlaylistSync,
  touchImportedPlaylist,
  undoImport,
  unlinkPlaylists,
} from './playlist-repository';

vi.mock('../database/execute-query', () => ({ default: vi.fn() }));

const database = fakeDatabase();
const source = { path: '/m/a.m3u', checksum: 'abc', modified: 5, encoding: 'utf-8' };
const sent = () => vi.mocked(executeQuery).mock.calls.map(([, { query, variables }]) => ({ query: query.trim().replace(/\s+/g, ' '), variables }));

describe('movedTo', () => {
  it('moves an id to an index, to the end when the index is past it, and leaves the ids when it is not there', () => {
    expect(movedTo([1, 2, 3], 3, 0)).toEqual([3, 1, 2]);
    expect(movedTo([1, 2, 3], 1, 9)).toEqual([2, 3, 1]);
    expect(movedTo([1, 2, 3], 2, -4)).toEqual([2, 1, 3]);
    expect(movedTo([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });
});

describe('the playlist repository', () => {
  beforeEach(() => vi.mocked(executeQuery).mockReset().mockResolvedValue([]));

  it('reads the playlists with their entries in their order', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce([
        { id: 1, name: 'One' },
        { id: 2, name: 'Two' },
      ])
      .mockResolvedValueOnce([{ id: 10, playlist_id: 2, path: '/m/a.flac', snapshot: '{"title":"A"}' }]);

    const playlists = await getPlaylists(database);

    expect(playlists.map(({ name, entries }) => [name, entries.length])).toEqual([
      ['One', 0],
      ['Two', 1],
    ]);
    expect(playlists[1].entries[0]).toMatchObject({ id: 10, path: '/m/a.flac' });
  });

  it('puts a new playlist last and returns its id', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([{ id: 4 }]);

    expect(await createPlaylist(database, 'New')).toBe(4);
    expect(sent()[0].variables[0]).toBe('New');
  });

  it('renames, deletes with its entries, and removes one entry', async () => {
    await renamePlaylist(database, 1, 'Mix');
    await deletePlaylist(database, 1);
    await removeEntry(database, 1, 9);

    expect(sent().map(({ query, variables }) => [query.replace(/ (SET|WHERE).*/, '').replace('FROM ', ''), variables])).toEqual([
      ['UPDATE playlists', ['Mix', 1]],
      ['DELETE playlist_tracks', [1]],
      ['DELETE playlists', [1]],
      ['DELETE playlist_tracks', [1, 9]],
    ]);
  });

  it('stores the new order of the playlists and of the entries after a move', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ]);
    await movePlaylist(database, 3, 0);
    expect(
      sent()
        .slice(1)
        .map(({ variables }) => variables)
    ).toEqual([
      [0, 3],
      [1, 1],
      [2, 2],
    ]);

    vi.mocked(executeQuery)
      .mockReset()
      .mockResolvedValueOnce([{ id: 5 }, { id: 6 }]);
    await moveEntry(database, 1, 5, 1);
    expect(
      sent()
        .slice(1)
        .map(({ variables }) => variables)
    ).toEqual([
      [0, 6],
      [1, 5],
    ]);
  });

  it('adds the entries one after the other, and none to a playlist that is not there', async () => {
    expect(await addEntries(database, 1, [{ path: '/a', snapshot: 1 }])).toBeUndefined();
    expect(sent()).toHaveLength(1);

    vi.mocked(executeQuery)
      .mockReset()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValue([]);
    await addEntries(database, 1, [
      { path: '/a', snapshot: { n: 1 } },
      { path: '/b', snapshot: 2 },
    ]);

    expect(
      sent()
        .slice(1)
        .map(({ variables }) => variables)
    ).toEqual([
      [1, '/a', '{"n":1}', 1],
      [1, '/b', '2', 1],
    ]);
  });

  it('lists the playlists that were imported with their flags, and not one without a file', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([
      {
        id: 1,
        name: 'A',
        source_path: '/a.m3u',
        source_checksum: 'c',
        source_mtime: 1,
        source_encoding: 'utf-8',
        source_encoding_override: null,
        source_sync: 1,
        can_undo: 0,
      },
      {
        id: 2,
        name: 'B',
        source_path: null,
        source_checksum: null,
        source_mtime: null,
        source_encoding: null,
        source_encoding_override: null,
        source_sync: 0,
        can_undo: 1,
      },
    ]);

    expect(await getImportedPlaylists(database)).toEqual([
      { id: 1, name: 'A', sourcePath: '/a.m3u', checksum: 'c', modified: 1, encoding: 'utf-8', encodingOverride: null, sync: true, canUndo: false },
    ]);
  });

  it('lists the names', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);

    expect(await getPlaylistNames(database)).toEqual(['A', 'B']);
  });

  it('links a new playlist to its file and gives its id', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce([{ id: 8 }]);

    expect(await createImportedPlaylist(database, 'In', source)).toBe(8);
    expect(sent()[0].variables.slice(2)).toEqual(['/m/a.m3u', 'abc', 5, 'utf-8']);
  });

  it('keeps the entries that the file replaces for one step back, and links the file', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce([{ id: 1, playlist_id: 3, path: '/old', snapshot: '{"x":1}' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3 }]);

    await replaceImportedEntries(database, 3, source, [{ path: '/new', snapshot: 1 }]);
    const queries = sent();

    expect(queries[1].variables).toEqual(['[{"path":"/old","snapshot":"{\\"x\\":1}"}]', 3]);
    expect(queries[2].query).toBe('DELETE FROM playlist_tracks WHERE playlist_id = ?');
    expect(queries.at(-1)?.variables).toEqual(['/m/a.m3u', 'abc', 5, 'utf-8', 3]);
  });

  it('goes back one step once, and says false when there is nothing to go back to', async () => {
    expect(await undoImport(database, 1)).toBe(false);

    vi.mocked(executeQuery)
      .mockReset()
      .mockResolvedValueOnce([{ previous_entries: '[{"path":"/old","snapshot":1}]' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValue([]);

    expect(await undoImport(database, 1)).toBe(true);
    expect(sent().at(-1)?.query).toContain('previous_entries = NULL');
  });

  it('sets the encoding, the sync flag, the time, the written file and unlinks', async () => {
    await setEncodingOverride(database, 1, 'latin1');
    await setEncodingOverride(database, 1, undefined);
    await setPlaylistSync(database, 1, true);
    await setPlaylistSync(database, 1, false);
    await touchImportedPlaylist(database, 1, 9);
    await markPlaylistWritten(database, 1, { checksum: 'z', modified: 2, encoding: 'utf-8' });
    await relinkPlaylistFile(database, 1, source);
    await unlinkPlaylists(database, [1, 2]);

    expect(sent().map(({ variables }) => variables)).toEqual([
      ['latin1', 1],
      [null, 1],
      [1, 1],
      [0, 1],
      [9, 1],
      ['z', 2, 'utf-8', 1],
      ['/m/a.m3u', 'abc', 5, 'utf-8', 1],
      [1],
      [2],
    ]);
  });
});
