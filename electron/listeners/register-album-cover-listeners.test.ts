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
const getImage = vi.fn();
const searchAlbums = vi.fn();

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
vi.mock('../services/artist-photos', () => ({ getImage: (...args: unknown[]) => getImage(...args) }));
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
    registerAlbumCoverListeners({ database, radioArt: { searchAlbums: (...args: unknown[]) => searchAlbums(...args) } } as unknown as ListenerContext);
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

  it('downloads the large cover of a search result and keeps it', async () => {
    const image = { extension: 'jpg', data: Buffer.from('jpeg') };
    getImage.mockResolvedValue(image);
    choose.mockResolvedValue('cover-2.jpg');
    const picture = 'https://coverartarchive.org/release-group/11111111-1111-4111-8111-111111111111/front-250';

    await change({ ...album, change: 'download', picture });

    expect(getImage).toHaveBeenCalledWith(picture.replace('front-250', 'front-500'));
    expect(choose).toHaveBeenCalledWith(database, expect.any(String), album.path, album.title, image);
    expect(sender.send).toHaveBeenCalledWith('ALBUM_COVER_CHANGED', { ...album, cover: 'cover-2.jpg' });
  });

  it('tells when the cover cannot be downloaded, and changes nothing', async () => {
    getImage.mockRejectedValue(new Error('404'));

    await change({ ...album, change: 'download', picture: 'https://coverartarchive.org/release-group/11111111-1111-4111-8111-111111111111/front-500' });

    expect(sender.send).toHaveBeenCalledExactlyOnceWith('ALBUM_COVER_FAILED', { reason: 'downloadFailed' });
    expect(choose).not.toHaveBeenCalled();
  });

  it('refuses to download from another server than the Cover Art Archive', () => {
    listeners.get('ALBUM_COVER_CHANGE')?.(event, { ...album, change: 'download', picture: 'https://example.test/release-group/1/front-500' });
    listeners.get('ALBUM_COVER_CHANGE')?.(event, {
      ...album,
      change: 'download',
      picture: 'https://coverartarchive.org.example.test/release-group/11111111-1111-4111-8111-111111111111/front-500',
    });

    expect(getImage).not.toHaveBeenCalled();
  });

  it('answers a search with the albums found and the text that was searched', async () => {
    const candidates = [{ name: 'Adam – Songs', picture: 'https://coverartarchive.org/release-group/x/front-250' }];
    searchAlbums.mockResolvedValue(candidates);

    listeners.get('ALBUM_COVER_SEARCH')?.(event, { query: ' adam songs ' });
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalled());

    expect(searchAlbums).toHaveBeenCalledWith('adam songs');
    expect(sender.send).toHaveBeenCalledWith('ALBUM_COVER_CANDIDATES', { query: 'adam songs', candidates });
  });

  it('tells when the search fails, and ignores an empty one', async () => {
    searchAlbums.mockRejectedValue(new Error('503'));

    listeners.get('ALBUM_COVER_SEARCH')?.(event, { query: '  ' });
    listeners.get('ALBUM_COVER_SEARCH')?.(event, { query: 'adam' });
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalled());

    expect(searchAlbums).toHaveBeenCalledExactlyOnceWith('adam');
    expect(sender.send).toHaveBeenCalledExactlyOnceWith('ALBUM_COVER_FAILED', { reason: 'searchFailed' });
  });

  it('ignores a request of the wrong shape', () => {
    listeners.get('ALBUM_COVER_CHANGE')?.(event, { path: '/music', change: 'delete' });

    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
