import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import type { Track } from '../types/library';
import addTrack from './addTrack';
import { folderColumns, getFolders, getLibrary, saveFolders } from './repositories/libraryRepository';
import removeFolderFromLibrary from './removeFolderFromLibrary';
import { createTestDatabase } from './test-database';
import { trackScan } from './scanCancellation';

const track = (trackPath: string): Track => ({
  path: trackPath,
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
});

describe('removeFolderFromLibrary', () => {
  let database: Database;
  const send = vi.fn();
  const sender = { send } as unknown as WebContents;
  const at = (...segments: string[]) => path.join(path.sep, 'music', ...segments);
  const paths = <T extends { path: string }>(rows: T[]) => rows.map((row) => row.path);

  beforeEach(async () => {
    send.mockReset();
    database = await createTestDatabase();
    await saveFolders(
      database,
      [at('a'), at('a', 'live'), at('ab')].map((folder) => ({ path: folder, lastModified: 1 }))
    );
    await Promise.all([at('a', 'one.flac'), at('a', 'live', 'two.flac'), at('ab', 'three.flac')].map((file) => addTrack(database, track(file))));
  });

  it('removes the folder, the folders below it and their tracks, and reports back', async () => {
    await removeFolderFromLibrary(database, at('a'), sender);

    expect(paths(await getFolders(database, folderColumns))).toEqual([at('ab')]);
    expect(paths(await getLibrary(database, { sort: undefined, folders: [] }, ['path']))).toEqual([at('ab', 'three.flac')]);
    expect(send).toHaveBeenCalledWith('STORE_FOLDERS', { folders: [{ path: at('ab'), lastModified: 1 }] });
    expect(send).toHaveBeenCalledWith('FOLDER_REMOVED_FROM_LIBRARY', {});
  });

  it('removes the tracks the scan stored with the other separator, as it does on Windows', async () => {
    await saveFolders(database, [{ path: 'C:\\music\\win', lastModified: 1 }]);
    await addTrack(database, track('C:/music/win/four.flac'));

    await removeFolderFromLibrary(database, 'C:\\music\\win', sender);

    expect(paths(await getLibrary(database, { sort: undefined, folders: [] }, ['path']))).not.toContain('C:/music/win/four.flac');
  });

  it('stops the scan of the folder, and leaves the scan of another one', async () => {
    const scanned = trackScan(at('a', 'live'));
    const other = trackScan(at('ab'));

    await removeFolderFromLibrary(database, at('a'), sender);

    expect([scanned.signal.aborted, other.signal.aborted]).toEqual([true, false]);
    [scanned, other].forEach((scan) => scan.release());
  });

  it('ignores a path that is not a library folder', async () => {
    await removeFolderFromLibrary(database, at(), sender);
    await removeFolderFromLibrary(database, 3, sender);

    expect(await getFolders(database, folderColumns)).toHaveLength(3);
    expect(await getLibrary(database, { sort: undefined, folders: [] }, ['path'])).toHaveLength(3);
    expect(send).not.toHaveBeenCalled();
  });
});
