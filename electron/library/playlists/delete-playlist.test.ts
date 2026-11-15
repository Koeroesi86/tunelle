import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dialog, shell } from 'electron';
import { deletePlaylist, getImportedPlaylists } from '../../repositories/playlist-repository';
import { deletePlaylistAfterAsking } from './delete-playlist';
import { handleWriteFailure } from './handle-write-failure';

vi.mock('electron', () => ({
  app: { getLocale: () => 'en-US' },
  dialog: { showMessageBox: vi.fn() },
  shell: { trashItem: vi.fn() },
}));
vi.mock('../../repositories/playlist-repository', () => ({ deletePlaylist: vi.fn(), getImportedPlaylists: vi.fn() }));
vi.mock('./handle-write-failure', () => ({ handleWriteFailure: vi.fn() }));

const linked = { id: 7, name: 'Road', sourcePath: '/music/lists/road.m3u', checksum: 'c', modified: 1, encoding: 'utf-8', sync: true };

describe('deletePlaylistAfterAsking', () => {
  const database: Parameters<typeof deletePlaylistAfterAsking>[0] = Object.create(null);
  const window: Parameters<typeof deletePlaylistAfterAsking>[1] = Object.create(null);
  const answer = (response: number) => vi.mocked(dialog.showMessageBox).mockResolvedValue({ response, checkboxChecked: false });

  beforeEach(() => {
    vi.mocked(deletePlaylist).mockReset().mockResolvedValue([]);
    vi.mocked(getImportedPlaylists).mockReset().mockResolvedValue([linked]);
    vi.mocked(shell.trashItem).mockReset().mockResolvedValue(undefined);
    vi.mocked(dialog.showMessageBox).mockReset();
    vi.mocked(handleWriteFailure).mockReset().mockResolvedValue(undefined);
  });

  it('deletes a playlist that has no file without asking', async () => {
    vi.mocked(getImportedPlaylists).mockResolvedValue([{ ...linked, id: 8 }]);

    await deletePlaylistAfterAsking(database, window, 7);

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(deletePlaylist).toHaveBeenCalledWith(database, 7);
    expect(shell.trashItem).not.toHaveBeenCalled();
  });

  it('warns that the playlist comes back while its file stays, and cancels by default', async () => {
    answer(2);

    await deletePlaylistAfterAsking(database, window, 7);

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({
        message: 'Delete Road?',
        detail: expect.stringMatching(/road\.m3u.*comes back/),
        buttons: ['Delete and move the file to the trash', 'Delete the playlist only', 'Cancel'],
        defaultId: 2,
        cancelId: 2,
      })
    );
    expect(deletePlaylist).not.toHaveBeenCalled();
    expect(shell.trashItem).not.toHaveBeenCalled();
  });

  it('moves the file to the trash and deletes the playlist when the user chooses so', async () => {
    answer(0);

    await deletePlaylistAfterAsking(database, window, 7);

    expect(shell.trashItem).toHaveBeenCalledWith('/music/lists/road.m3u');
    expect(deletePlaylist).toHaveBeenCalledWith(database, 7);
  });

  it('deletes only the playlist and leaves the file when the user chooses so', async () => {
    answer(1);

    await deletePlaylistAfterAsking(database, window, 7);

    expect(shell.trashItem).not.toHaveBeenCalled();
    expect(deletePlaylist).toHaveBeenCalledWith(database, 7);
  });

  it('keeps the playlist and tells the user when the file cannot be moved to the trash', async () => {
    const failure = new Error('read only');
    answer(0);
    vi.mocked(shell.trashItem).mockRejectedValue(failure);

    await deletePlaylistAfterAsking(database, window, 7);

    expect(deletePlaylist).not.toHaveBeenCalled();
    expect(handleWriteFailure).toHaveBeenCalledWith(
      database,
      window,
      7,
      expect.objectContaining({ kind: 'failed', filePath: '/music/lists/road.m3u', cause: failure })
    );
  });

  it('asks without a window when there is none', async () => {
    answer(2);

    await deletePlaylistAfterAsking(database, null, 7);

    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: 'Delete Road?' }));
  });
});
