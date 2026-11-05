import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { Folder } from '@shared/types/library';
import addFoldersToLibrary from './addFoldersToLibrary';
import executeQuery from '../database/executeQuery';
import scanFolders from './scanFolders';
import { createTestDatabase } from '../test-database';

vi.mock('./scanFolders', () => ({ default: vi.fn() }));

describe('addFoldersToLibrary', () => {
  let database: Database;
  let root: string;
  const send = vi.fn();
  const sender = { send } as unknown as WebContents;
  const folder = (...names: string[]) => path.join(root, ...names);
  const make = (...names: string[]) => fs.mkdirSync(folder(...names), { recursive: true });
  const stored = () =>
    executeQuery<Folder>(database, { query: 'SELECT path FROM folders ORDER BY path', variables: [] }).then((rows) => rows.map((row) => row.path));
  const seed = (...paths: string[]) =>
    Promise.all(paths.map((p) => executeQuery(database, { query: 'INSERT INTO folders (path, lastModified) VALUES (?, 1)', variables: [p] })));

  beforeEach(async () => {
    send.mockReset();
    vi.mocked(scanFolders).mockReset().mockResolvedValue([]);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-add-'));
    database = await createTestDatabase();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stores and scans the directories and reports back', async () => {
    make('music');
    await addFoldersToLibrary(database, [{ path: folder('music'), lastModified: 5 }], sender);

    expect(await stored()).toEqual([folder('music')]);
    expect(scanFolders).toHaveBeenCalledWith([{ path: folder('music'), lastModified: 5 }], sender);
    expect(send.mock.calls.map(([channel]) => channel)).toEqual(['STORE_FOLDERS', 'FOLDERS_ADDED_TO_LIBRARY', 'TRACKS_ADDED_TO_LIBRARY']);
  });

  it('stores time zero for a folder that has files which did not answer, so the next scan looks at it again', async () => {
    make('music');
    vi.mocked(scanFolders).mockResolvedValue([{ path: folder('music') }]);

    await addFoldersToLibrary(database, [{ path: folder('music'), lastModified: 5 }], sender);

    expect(await executeQuery(database, { query: 'SELECT path, lastModified FROM folders', variables: [] })).toEqual([
      { path: folder('music'), lastModified: 0 },
    ]);
  });

  it('ignores files, missing paths and malformed items', async () => {
    fs.writeFileSync(folder('song.flac'), 'x');
    await addFoldersToLibrary(
      database,
      [{ path: folder('song.flac'), lastModified: 1 }, { path: folder('missing'), lastModified: 1 }, { path: 3 }, null],
      sender
    );

    expect(await stored()).toEqual([]);
  });

  it('ignores a payload that is not a list', async () => {
    await addFoldersToLibrary(database, 'nope', sender);

    expect(await stored()).toEqual([]);
  });

  it('replaces the folders inside every added folder, not only the first', async () => {
    make('a');
    make('b');
    await seed(folder('a', 'one'), folder('b', 'two'), folder('c'));
    await addFoldersToLibrary(
      database,
      [
        { path: folder('a'), lastModified: 1 },
        { path: folder('b'), lastModified: 1 },
      ],
      sender
    );

    expect(await stored()).toEqual([folder('a'), folder('b'), folder('c')]);
  });

  it('keeps a sibling that only shares the name prefix', async () => {
    make('music');
    await seed(folder('music2'));
    await addFoldersToLibrary(database, [{ path: folder('music'), lastModified: 1 }], sender);

    expect(await stored()).toEqual([folder('music'), folder('music2')]);
  });

  it('treats % and _ in a folder name literally', async () => {
    make('a_c');
    await seed(folder('abc', 'x'));
    await addFoldersToLibrary(database, [{ path: folder('a_c'), lastModified: 1 }], sender);

    expect(await stored()).toEqual([folder('a_c'), folder('abc', 'x')]);
  });
});
