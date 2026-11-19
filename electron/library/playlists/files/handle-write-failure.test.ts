import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { Notification, dialog } from 'electron';
import { handleWriteFailure } from './handle-write-failure';
import { PlaylistWriteError, switchToM3u8 } from '../import-export/export-playlist';
import { setPlaylistSync } from '../../../repositories/playlist-repository';

const shown = vi.fn();
const created = vi.fn();

vi.mock('electron', () => {
  class FakeNotification {
    static isSupported = vi.fn(() => true);
    constructor(options: unknown) {
      created(options);
    }
    show = shown;
  }
  return { Notification: FakeNotification, BrowserWindow: class {}, dialog: { showMessageBox: vi.fn() }, app: { getLocale: () => 'en-US' } };
});
vi.mock('../import-export/export-playlist', async (importOriginal) => ({ ...(await importOriginal<object>()), switchToM3u8: vi.fn() }));
vi.mock('../../../repositories/playlist-repository', () => ({ setPlaylistSync: vi.fn() }));
vi.mock('../../../utils/log-error', () => ({ logError: vi.fn() }));

const database: Parameters<typeof handleWriteFailure>[0] = Object.create(null);

describe('handleWriteFailure', () => {
  beforeEach(() => {
    shown.mockReset();
    created.mockReset();
    vi.mocked(Notification.isSupported).mockReturnValue(true);
    vi.mocked(switchToM3u8).mockReset().mockResolvedValue(undefined);
    vi.mocked(setPlaylistSync).mockReset().mockResolvedValue([]);
    vi.mocked(dialog.showMessageBox).mockReset();
  });

  it('shows a notification with the file and the reason when the file cannot be written', async () => {
    await handleWriteFailure(database, null, 7, new PlaylistWriteError('/music/mix.m3u', 'failed', new Error('EROFS: read-only file system')));

    expect(created).toHaveBeenCalledWith({ title: 'Could not write mix.m3u', body: 'EROFS: read-only file system' });
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when notifications are not supported, and for an error that is not a failed write', async () => {
    vi.mocked(Notification.isSupported).mockReturnValue(false);
    await handleWriteFailure(database, null, 7, new PlaylistWriteError('/music/mix.m3u', 'failed'));
    await handleWriteFailure(database, null, 7, new Error('other'));

    expect(shown).not.toHaveBeenCalled();
  });

  it('writes .m3u8 when the user chooses so', async () => {
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });

    await handleWriteFailure(database, {} as BrowserWindow, 7, new PlaylistWriteError('/music/mix.m3u', 'encoding'));

    expect(switchToM3u8).toHaveBeenCalledWith(database, 7);
    expect(setPlaylistSync).not.toHaveBeenCalled();
  });

  it('turns the sync off when the user keeps the file', async () => {
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

    await handleWriteFailure(database, null, 7, new PlaylistWriteError('/music/mix.m3u', 'encoding'));

    expect(setPlaylistSync).toHaveBeenCalledWith(database, 7, false);
    expect(switchToM3u8).not.toHaveBeenCalled();
  });

  it('shows a notification when the switch to .m3u8 fails', async () => {
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
    vi.mocked(switchToM3u8).mockRejectedValue(new PlaylistWriteError('/music/mix.m3u8', 'failed', new Error('There is a file with that name')));

    await handleWriteFailure(database, null, 7, new PlaylistWriteError('/music/mix.m3u', 'encoding'));

    expect(created).toHaveBeenCalledWith({ title: 'Could not write mix.m3u8', body: 'There is a file with that name' });
  });
});
