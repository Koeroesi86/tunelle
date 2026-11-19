import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import type { PlaylistImportReport } from '@shared/types/playlists';
import { syncPlaylistFiles } from './sync-playlist-files';
import { importPlaylistFiles } from '../import-export/import-playlist-files';
import { removeVanishedPlaylists } from '../import-export/imported-playlists';
import { sendPlaylists } from '../import-export/send-playlists';

vi.mock('../import-export/import-playlist-files', () => ({ importPlaylistFiles: vi.fn() }));
vi.mock('../import-export/imported-playlists', () => ({ removeVanishedPlaylists: vi.fn() }));
vi.mock('../import-export/send-playlists', () => ({ sendPlaylists: vi.fn() }));

const report = (status: PlaylistImportReport['status']): PlaylistImportReport => ({
  fileName: '/m/a.m3u',
  name: 'a',
  status,
  imported: 1,
  unmatched: [],
  streams: 0,
});

describe('syncPlaylistFiles', () => {
  const database: Parameters<typeof syncPlaylistFiles>[0] = Object.create(null);
  const sender = {} as WebContents;
  const files = ['/m/a.m3u'];
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(importPlaylistFiles)
      .mockReset()
      .mockResolvedValue([report('unchanged')]);
    vi.mocked(removeVanishedPlaylists).mockReset().mockResolvedValue(0);
    vi.mocked(sendPlaylists).mockReset().mockResolvedValue(undefined);
  });

  it('imports the files it is given and removes the playlists of the files that are gone, from the folder that was scanned', async () => {
    await syncPlaylistFiles(database, sender, '/m', true, files);

    expect(importPlaylistFiles).toHaveBeenCalledWith(database, files);
    expect(removeVanishedPlaylists).toHaveBeenCalledWith(database, '/m', true, files);
  });

  it('tells the window nothing when every file is as it was and none was removed', async () => {
    await syncPlaylistFiles(database, sender, '/m', false, files);

    expect(sendPlaylists).not.toHaveBeenCalled();
  });

  it.each(['created', 'updated'] as const)('tells the window when a playlist was %s', async (status) => {
    vi.mocked(importPlaylistFiles).mockResolvedValue([report('unchanged'), report(status)]);

    await syncPlaylistFiles(database, sender, '/m', false, files);

    expect(sendPlaylists).toHaveBeenCalledWith(database, sender);
  });

  it('tells the window when a playlist was removed', async () => {
    vi.mocked(removeVanishedPlaylists).mockResolvedValue(2);

    await syncPlaylistFiles(database, sender, '/m', true, []);

    expect(sendPlaylists).toHaveBeenCalledTimes(1);
  });

  it('logs an import that fails, still removes the vanished ones, and does not fail the scan', async () => {
    vi.mocked(importPlaylistFiles).mockRejectedValue(new Error('no database'));
    vi.mocked(removeVanishedPlaylists).mockResolvedValue(1);

    await expect(syncPlaylistFiles(database, sender, '/m', true, files)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Importing the playlists of /m failed', expect.objectContaining({ message: 'no database' }));
    expect(sendPlaylists).toHaveBeenCalledTimes(1);
  });

  it('logs a removal that fails, and still tells the window what was imported', async () => {
    vi.mocked(importPlaylistFiles).mockResolvedValue([report('created')]);
    vi.mocked(removeVanishedPlaylists).mockRejectedValue(new Error('locked'));

    await expect(syncPlaylistFiles(database, sender, '/m', true, files)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Importing the playlists of /m failed', expect.objectContaining({ message: 'locked' }));
    expect(sendPlaylists).toHaveBeenCalledTimes(1);
  });

  it('logs a failure to tell the window and does not fail the scan', async () => {
    vi.mocked(importPlaylistFiles).mockResolvedValue([report('updated')]);
    vi.mocked(sendPlaylists).mockRejectedValue(new Error('window closed'));

    await expect(syncPlaylistFiles(database, sender, '/m', true, files)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Importing the playlists of /m failed', expect.objectContaining({ message: 'window closed' }));
  });
});
