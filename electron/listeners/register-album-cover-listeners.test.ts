import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerAlbumCoverListeners from './register-album-cover-listeners';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();
const showOpenDialog = vi.fn();
const choose = vi.fn();
const remove = vi.fn();
const reset = vi.fn();
const read = vi.fn();
const queueAccents = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) },
  BrowserWindow: { fromWebContents: () => undefined },
}));
vi.mock('../language', () => ({ getMainTranslator: () => ({ t: (key: string) => key }) }));
vi.mock('../services/album-cover-choice', () => ({
  chooseAlbumCover: (...args: unknown[]) => choose(...args),
  removeAlbumCover: (...args: unknown[]) => remove(...args),
  resetAlbumCover: (...args: unknown[]) => reset(...args),
}));
vi.mock('../services/artist-photo-choice', () => ({ readPhotoFile: (...args: unknown[]) => read(...args) }));
vi.mock('../library/art/album-art-accents', () => ({ queueAlbumArtAccents: (...args: unknown[]) => queueAccents(...args) }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

describe('registerAlbumCoverListeners', () => {
  const sender = { send: vi.fn(), isDestroyed: () => false };
  const event = { sender } as unknown as IpcMainEvent;
  // the database is not used by what is tested: the services that would use it are replaced
  const database = {};
  const album = { path: '/music/adam', title: 'Songs' };
  const change = async (payload: unknown) => {
    listeners.get('ALBUM_COVER_CHANGE')?.(event, payload);
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalled());
  };

  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    global._appDataPath = '/data';
    registerAlbumCoverListeners({ database } as unknown as ListenerContext);
  });

  it('keeps the image that is picked, picks the colour and tells the page the cover', async () => {
    const image = { extension: 'png', data: Buffer.from('png') };
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/pictures/front.png'] });
    read.mockResolvedValue({ image });
    choose.mockResolvedValue('cover-1.png');

    await change({ ...album, change: 'pick' });

    expect(read).toHaveBeenCalledWith('/pictures/front.png');
    expect(choose).toHaveBeenCalledWith(database, expect.stringContaining('albumart'), album.path, album.title, image);
    expect(queueAccents).toHaveBeenCalledWith(database);
    expect(sender.send).toHaveBeenCalledWith('ALBUM_COVER_CHANGED', { ...album, cover: 'cover-1.png' });
  });

  it('tells why a file cannot be used, and changes nothing', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/pictures/front.txt'] });
    read.mockResolvedValue({ reason: 'tooLarge' });

    await change({ ...album, change: 'pick' });

    expect(sender.send).toHaveBeenCalledExactlyOnceWith('ALBUM_COVER_FAILED', { reason: 'tooLarge' });
    expect(choose).not.toHaveBeenCalled();
  });

  it('does nothing when the dialog is cancelled', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    listeners.get('ALBUM_COVER_CHANGE')?.(event, { ...album, change: 'pick' });
    await vi.waitFor(() => expect(showOpenDialog).toHaveBeenCalled());
    await Promise.resolve();

    expect(read).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('removes the cover, and resets it to the one of the tags', async () => {
    remove.mockResolvedValue(null);
    reset.mockResolvedValue('tags.jpg');

    await change({ ...album, change: 'remove' });
    await change({ ...album, change: 'reset' });

    expect(remove).toHaveBeenCalledWith(database, expect.any(String), album.path, album.title);
    expect(reset).toHaveBeenCalledWith(database, expect.any(String), album.path, album.title);
    expect(sender.send).toHaveBeenCalledWith('ALBUM_COVER_CHANGED', { ...album, cover: null });
    expect(sender.send).toHaveBeenCalledWith('ALBUM_COVER_CHANGED', { ...album, cover: 'tags.jpg' });
  });

  it('ignores a request of the wrong shape', () => {
    listeners.get('ALBUM_COVER_CHANGE')?.(event, { path: '/music', change: 'delete' });

    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
