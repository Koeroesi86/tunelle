import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { parseFile } from 'music-metadata';
import scanFolder from './scanFolder';
import executeQuery from '../database/executeQuery';
import { createTestDatabase } from '../test-database';

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

const meta = (title: string) => ({ common: { artist: 'Artist', album: 'Album', title }, format: { duration: 60 }, native: {} });

describe('scanFolder of files that did not change', () => {
  let database: Database;
  let root: string;
  let file: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const parsed = vi.mocked(parseFile);
  const stored = () =>
    executeQuery<Record<string, unknown>>(database, { query: 'SELECT title, fileModified, fileSize FROM library ORDER BY path', variables: [] });

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-unchanged-'));
    file = path.join(root, 'a.flac');
    fs.writeFileSync(file, 'not audio');
    fs.utimesSync(file, 1_700_000_000, 1_700_000_000);
    parsed.mockResolvedValue(meta('First') as never);
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = root;
  });

  afterEach(() => {
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
    parsed.mockReset();
  });

  it('stores the modification time and the size of a file with its tags', async () => {
    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ title: 'First', fileModified: 1_700_000_000_000, fileSize: 9 }]);
  });

  it('does not read a file again when its modification time and size are the same', async () => {
    await scanFolder(root, sender);
    parsed.mockClear();

    await scanFolder(root, sender);

    expect(parsed).not.toHaveBeenCalled();
    expect(await stored()).toEqual([{ title: 'First', fileModified: 1_700_000_000_000, fileSize: 9 }]);
  });

  it('reads a file again when its size differs, also with the same modification time', async () => {
    await scanFolder(root, sender);
    fs.writeFileSync(file, 'not audio, longer');
    fs.utimesSync(file, 1_700_000_000, 1_700_000_000);
    parsed.mockResolvedValue(meta('Second') as never);

    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ title: 'Second', fileModified: 1_700_000_000_000, fileSize: 17 }]);
  });

  it('reads a file again when its modification time differs, also with the same size', async () => {
    await scanFolder(root, sender);
    fs.utimesSync(file, 1_700_000_100, 1_700_000_100);
    parsed.mockResolvedValue(meta('Second') as never);

    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ title: 'Second', fileModified: 1_700_000_100_000, fileSize: 9 }]);
  });

  it('reads a file of a row from before the stat was kept, once', async () => {
    await scanFolder(root, sender);
    await executeQuery(database, { query: 'UPDATE library SET fileModified = NULL, fileSize = NULL', variables: [] });
    parsed.mockClear();

    await scanFolder(root, sender);
    await scanFolder(root, sender);

    expect(parsed).toHaveBeenCalledTimes(1);
    expect(await stored()).toEqual([{ title: 'First', fileModified: 1_700_000_000_000, fileSize: 9 }]);
  });

  it('reads only the files that changed among those that did not', async () => {
    const other = path.join(root, 'b.flac');
    fs.writeFileSync(other, 'not audio');
    await scanFolder(root, sender);
    fs.writeFileSync(other, 'changed audio');
    parsed.mockClear();

    await scanFolder(root, sender);

    expect(parsed).toHaveBeenCalledExactlyOnceWith(other);
  });
});
