import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { deleteTracks, getFolders, getTracksInside } from '../../repositories/library-repository';
import { reportOfflineFolders } from '../watch/folder-availability';
import { recordLibraryChange } from '../changes/library-changes';
import { memoryFs } from '../../test-memory-fs';
import { fakeDatabase } from '../../test-fake-database';
import { findMissingTracks } from './missing-tracks';
import scanFolder from './scan-folder';
import rescanChanges from './rescan-changes';

vi.mock('fs', () => ({
  ...memoryFs.sync,
  default: {
    ...memoryFs.sync,
    promises: {
      ...memoryFs.promises,
      stat: async (path: string) => ({ isDirectory: () => memoryFs.sync.existsSync(path) && !memoryFs.sync.readdirSync('/').includes(path) }),
    },
  },
}));
vi.mock('../../repositories/library-repository', () => ({ deleteTracks: vi.fn(), getFolders: vi.fn(), getTracksInside: vi.fn() }));
vi.mock('../watch/folder-availability', async (importOriginal) => ({ ...(await importOriginal<object>()), reportOfflineFolders: vi.fn() }));
vi.mock('../changes/library-changes', () => ({ recordLibraryChange: vi.fn() }));
vi.mock('./missing-tracks', () => ({ findMissingTracks: vi.fn() }));
vi.mock('./scan-folder', () => ({ default: vi.fn() }));
vi.mock('../tasks/queue-task', () => ({ scanPriority: 1, queueTask: (_kind: string, _name: string, _priority: number, run: () => Promise<void>) => run() }));
vi.mock('../tasks/background-queue', () => ({ scanKind: 'scan' }));

const send = vi.fn();
const sender = { send } as unknown as WebContents;
const database = fakeDatabase();

describe('rescanChanges', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/music/new');
    global._database = database;
    send.mockReset();
    vi.mocked(getFolders)
      .mockReset()
      .mockResolvedValue([
        { path: '/music', lastModified: 1 },
        { path: '/off', lastModified: 1 },
      ]);
    vi.mocked(reportOfflineFolders)
      .mockReset()
      .mockResolvedValue({ offline: ['/off'] } as never);
    vi.mocked(getTracksInside).mockReset().mockResolvedValue([]);
    vi.mocked(findMissingTracks).mockReset().mockResolvedValue([]);
    vi.mocked(scanFolder).mockReset();
    vi.mocked(deleteTracks).mockReset();
    vi.mocked(recordLibraryChange).mockReset();
  });

  it('does nothing before the database is connected', async () => {
    global._database = undefined;

    await rescanChanges(sender, [{ path: '/music/new', deep: true }]);

    expect(getFolders).not.toHaveBeenCalled();
  });

  it('scans the places that are folders, with their depth, and leaves out the ones that are gone or offline', async () => {
    await rescanChanges(sender, [
      { path: '/music/new', deep: true },
      { path: '/music/gone', deep: false },
      { path: '/off/x', deep: true },
    ]);

    expect(vi.mocked(scanFolder).mock.calls.map(([path, , deep]) => [path, deep])).toEqual([['/music/new', true]]);
    expect(send).toHaveBeenCalledWith('RESCAN_COMPLETE', {});
  });

  it('removes the tracks that are gone from the places that changed, a shallow place only for the tracks directly in it', async () => {
    vi.mocked(getTracksInside).mockResolvedValue([{ path: '/music/new/1.flac' }, { path: '/music/new/sub/2.flac' }] as never);
    vi.mocked(findMissingTracks).mockImplementation(async (tracks) => tracks);

    await rescanChanges(sender, [{ path: '/music/new', deep: false }]);

    expect(vi.mocked(findMissingTracks).mock.calls[0][0].map(({ path }) => path)).toEqual(['/music/new/1.flac']);
    expect(deleteTracks).toHaveBeenCalledWith(database, [{ path: '/music/new/1.flac' }]);
    expect(recordLibraryChange).toHaveBeenCalledWith(sender, { removed: 1 });
  });

  it('takes the tracks below a deep place whole', async () => {
    vi.mocked(getTracksInside).mockResolvedValue([{ path: '/music/new/sub/2.flac' }] as never);

    await rescanChanges(sender, [{ path: '/music/new', deep: true }]);

    expect(vi.mocked(findMissingTracks).mock.calls[0][0]).toEqual([{ path: '/music/new/sub/2.flac' }]);
  });

  it('logs a failure', async () => {
    vi.mocked(getFolders).mockRejectedValue(new Error('broken'));

    await rescanChanges(sender, [{ path: '/music/new', deep: true }]);

    expect(console.error).toHaveBeenCalledWith(expect.any(Error));
  });
});
