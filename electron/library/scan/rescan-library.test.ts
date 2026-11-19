import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { deleteTracks, getFolders, getLibrary, saveFolders } from '../../repositories/library-repository';
import { reportOfflineFolders } from '../watch/folder-availability';
import { mountGuard } from '../mounts/mount-guard';
import { recordLibraryChange } from '../changes/library-changes';
import { queueAlbumArtAccents } from '../art/album-art-accents';
import { fakeDatabase } from '../../test-fake-database';
import { findMissingTracks } from './missing-tracks';
import scanFolders from './scan-folders';
import rescanLibrary from './rescan-library';

vi.mock('../../repositories/library-repository', () => ({ deleteTracks: vi.fn(), getFolders: vi.fn(), getLibrary: vi.fn(), saveFolders: vi.fn() }));
vi.mock('../watch/folder-availability', async (importOriginal) => ({ ...(await importOriginal<object>()), reportOfflineFolders: vi.fn() }));
vi.mock('../mounts/mount-guard', () => ({ mountGuard: vi.fn() }));
vi.mock('./scan-folders', () => ({ default: vi.fn() }));
vi.mock('../changes/library-changes', () => ({ recordLibraryChange: vi.fn() }));
vi.mock('../art/album-art-accents', () => ({ queueAlbumArtAccents: vi.fn() }));
vi.mock('./missing-tracks', () => ({ findMissingTracks: vi.fn() }));
vi.mock('../tasks/queue-task', () => ({ scanPriority: 1, queueTask: (_kind: string, _name: string, _priority: number, run: () => Promise<void>) => run() }));
vi.mock('../tasks/background-queue', () => ({ scanKind: 'scan' }));

const send = vi.fn();
const sender = { send } as unknown as WebContents;
const database = fakeDatabase();
const folder = (path: string, lastModified: number) => ({ path, lastModified });
const track = (path: string, codec = 'flac') => ({ path, codec });

describe('rescanLibrary', () => {
  const readTime = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global._database = database;
    send.mockReset();
    readTime.mockReset().mockImplementation(async (mount: string) => ({ '/a': 20, '/b': 5 })[mount]);
    vi.mocked(mountGuard).mockReturnValue({ readTime } as unknown as ReturnType<typeof mountGuard>);
    vi.mocked(getFolders)
      .mockReset()
      .mockResolvedValue([folder('/a', 10), folder('/b', 5), folder('/off', 1)]);
    vi.mocked(reportOfflineFolders)
      .mockReset()
      .mockResolvedValue({ offline: ['/off'] } as never);
    vi.mocked(scanFolders).mockReset().mockResolvedValue([]);
    vi.mocked(saveFolders).mockReset();
    vi.mocked(deleteTracks).mockReset();
    vi.mocked(getLibrary).mockReset().mockResolvedValue([]);
    vi.mocked(findMissingTracks).mockReset().mockResolvedValue([]);
    vi.mocked(recordLibraryChange).mockReset();
    vi.mocked(queueAlbumArtAccents).mockReset();
  });

  it('does nothing before the database is connected', async () => {
    global._database = undefined;

    await rescanLibrary(sender);

    expect(getFolders).not.toHaveBeenCalled();
  });

  it('scans the folders that changed since they were stored, and stores them with the time seen before the scan', async () => {
    await rescanLibrary(sender);

    expect(scanFolders).toHaveBeenCalledWith([folder('/a', 10)], sender);
    expect(saveFolders).toHaveBeenCalledWith(database, [{ path: '/a', lastModified: 20 }]);
    expect(queueAlbumArtAccents).toHaveBeenCalledWith(database);
    expect(send).toHaveBeenCalledWith('RESCAN_COMPLETE', {});
  });

  it('scans every folder that answers when forced, and not the ones that are offline', async () => {
    await rescanLibrary(sender, true);

    expect(vi.mocked(scanFolders).mock.calls[0][0].map(({ path }) => path)).toEqual(['/a', '/b']);
  });

  it('does not store a folder that was not scanned completely or was removed meanwhile', async () => {
    vi.mocked(getFolders)
      .mockResolvedValueOnce([folder('/a', 10), folder('/b', 1)])
      .mockResolvedValueOnce([folder('/b', 1)]);

    await rescanLibrary(sender);
    expect(saveFolders).toHaveBeenCalledWith(database, [{ path: '/b', lastModified: 5 }]);

    vi.mocked(getFolders).mockResolvedValue([folder('/a', 10)]);
    vi.mocked(scanFolders).mockResolvedValue([folder('/a', 10)]);
    await rescanLibrary(sender);
    expect(saveFolders).toHaveBeenLastCalledWith(database, []);
  });

  it('removes the tracks that are gone and the ones of a format that is not played, but keeps the tracks below an offline folder', async () => {
    vi.mocked(getLibrary).mockResolvedValue([track('/a/1.flac'), track('/a/2.flac'), track('/a/3.xyz'), track('/off/5.flac')] as never);
    vi.mocked(findMissingTracks).mockImplementation(async (tracks) => tracks.filter(({ path }) => path === '/a/2.flac'));

    await rescanLibrary(sender);

    expect(vi.mocked(findMissingTracks).mock.calls[0][0].map(({ path }) => path)).not.toContain('/off/5.flac');
    expect(vi.mocked(deleteTracks).mock.calls[0][1].map(({ path }) => path)).toEqual(['/a/2.flac', '/a/3.xyz']);
    expect(recordLibraryChange).toHaveBeenCalledWith(sender, { removed: 2 });
  });

  it('logs a failure and does not tell the window that the scan is complete', async () => {
    vi.mocked(getFolders).mockRejectedValue(new Error('broken'));

    await rescanLibrary(sender);

    expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    expect(send).not.toHaveBeenCalled();
  });
});
