import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from 'sqlite3';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerArtistPhotoChoiceListeners from './register-artist-photo-choice-listeners';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();
const showOpenDialog = vi.fn();
const choose = vi.fn();
const remove = vi.fn();
const reset = vi.fn();
const read = vi.fn();

vi.mock('sqlite3', () => ({ Database: class {} }));
vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) },
  BrowserWindow: { fromWebContents: () => undefined },
}));
vi.mock('../language', () => ({ getMainTranslator: () => ({ t: (key: string) => key }) }));
vi.mock('../services/artist-photo-choice', () => ({
  chooseArtistPhoto: (...args: unknown[]) => choose(...args),
  removeArtistPhoto: (...args: unknown[]) => remove(...args),
  resetArtistPhoto: (...args: unknown[]) => reset(...args),
  readPhotoFile: (...args: unknown[]) => read(...args),
}));

describe('registerArtistPhotoChoiceListeners', () => {
  const sender = { send: vi.fn(), isDestroyed: () => false };
  const event = { sender } as unknown as IpcMainEvent;
  const database = new Database(':memory:');
  const change = async (payload: unknown) => {
    listeners.get('ARTIST_PHOTO_CHANGE')?.(event, payload);
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalled());
  };

  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    global._appDataPath = '/data';
    choose.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    reset.mockResolvedValue(undefined);
    registerArtistPhotoChoiceListeners({ database } as unknown as ListenerContext);
  });

  it('keeps the image that is picked and tells the lists', async () => {
    const image = { extension: 'png', data: Buffer.from('png') };
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/pictures/adam.png'] });
    read.mockResolvedValue({ image });

    await change({ key: 'adam', change: 'pick' });

    expect(read).toHaveBeenCalledWith('/pictures/adam.png');
    expect(choose).toHaveBeenCalledWith(database, expect.stringContaining('albumart'), 'adam', image);
    expect(sender.send).toHaveBeenCalledWith('ARTIST_PHOTOS_READY', {});
  });

  it('tells why a file cannot be used, and changes nothing', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/pictures/adam.txt'] });
    read.mockResolvedValue({ reason: 'notImage' });

    await change({ key: 'adam', change: 'pick' });

    expect(sender.send).toHaveBeenCalledExactlyOnceWith('ARTIST_PHOTO_FAILED', { reason: 'notImage' });
    expect(choose).not.toHaveBeenCalled();
  });

  it('does nothing when the dialog is cancelled', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    listeners.get('ARTIST_PHOTO_CHANGE')?.(event, { key: 'adam', change: 'pick' });
    await vi.waitFor(() => expect(showOpenDialog).toHaveBeenCalled());
    await Promise.resolve();

    expect(read).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('removes and resets the photo of a name', async () => {
    await change({ key: 'adam', change: 'remove' });
    await change({ key: 'eve', change: 'reset' });

    expect(remove).toHaveBeenCalledWith(database, expect.any(String), 'adam');
    expect(reset).toHaveBeenCalledWith(database, expect.any(String), 'eve');
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('drops a request of the wrong shape', () => {
    listeners.get('ARTIST_PHOTO_CHANGE')?.(event, { key: '', change: 'pick' });
    listeners.get('ARTIST_PHOTO_CHANGE')?.(event, { key: 'adam', change: 'delete' });

    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
