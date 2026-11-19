import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from 'sqlite3';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerFavouriteListeners from './register-favourite-listeners';
import { addFavourite, getFavourites, removeFavourite } from '../repositories/favourites-repository';
import { withAvailability } from '../library/watch/favourite-availability';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

// what the listeners call is replaced: the database, the repository and the look at the library for the availability
vi.mock('sqlite3', () => ({ Database: class {} }));
vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));
vi.mock('../repositories/favourites-repository', () => ({ addFavourite: vi.fn(), getFavourites: vi.fn(), removeFavourite: vi.fn() }));
vi.mock('../library/watch/favourite-availability', () => ({ withAvailability: vi.fn() }));

const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
const key = { source: 'radio', kind: 'station', id: 'abc' };
const stored = [{ ...key, snapshot: station, addedAt: 1 }];

describe('registerFavouriteListeners', () => {
  const database = new Database(':memory:');
  const send = vi.fn();
  const event = { sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent;
  const context = { database, radio: { findStations: async () => [station] } } as unknown as ListenerContext;
  /** What the listeners do is a chain of promises that are all answered at once: the time goes by until they are done */
  const flush = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    listeners.clear();
    send.mockReset();
    vi.mocked(addFavourite).mockReset().mockResolvedValue([]);
    vi.mocked(removeFavourite).mockReset().mockResolvedValue([]);
    vi.mocked(getFavourites).mockReset().mockResolvedValue(stored);
    vi.mocked(withAvailability)
      .mockReset()
      .mockImplementation(async (items) => items.map((item) => ({ ...item, available: true })));
    registerFavouriteListeners(context);
  });

  afterEach(() => vi.useRealTimers());

  it('sends the favourites with their availability when the window asks for them', async () => {
    listeners.get('FAVOURITES_LOAD')?.(event);
    await flush();

    expect(getFavourites).toHaveBeenCalledWith(database);
    expect(withAvailability).toHaveBeenCalledWith(stored, context);
    expect(send).toHaveBeenCalledWith('FAVOURITES', { favourites: [{ ...stored[0], available: true }] });
  });

  it('stores a favourite and then sends the list', async () => {
    listeners.get('FAVOURITE_ADD')?.(event, { ...key, snapshot: station });
    await flush();

    expect(addFavourite).toHaveBeenCalledWith(database, key, station);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('FAVOURITES', { favourites: [{ ...stored[0], available: true }] });
  });

  it('removes a favourite and then sends the list', async () => {
    listeners.get('FAVOURITE_REMOVE')?.(event, key);
    await flush();

    expect(removeFavourite).toHaveBeenCalledWith(database, key);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, 'text', {}, { ...key, id: '' }, { ...key, id: 1 }, { ...key, snapshot: 'text' }, { ...key, snapshot: null }])(
    'ignores the malformed addition %j',
    async (payload) => {
      listeners.get('FAVOURITE_ADD')?.(event, payload);
      await flush();

      expect(addFavourite).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, 'text', {}, { ...key, id: '' }])('ignores the malformed removal %j', async (payload) => {
    listeners.get('FAVOURITE_REMOVE')?.(event, payload);
    await flush();

    expect(removeFavourite).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('logs a failure and sends nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(addFavourite).mockRejectedValue(new Error('disk full'));

    listeners.get('FAVOURITE_ADD')?.(event, { ...key, snapshot: station });
    await flush();

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send to a window that was closed meanwhile', async () => {
    const isDestroyed = vi.fn(() => true);
    listeners.get('FAVOURITES_LOAD')?.({ sender: { send, isDestroyed } } as unknown as IpcMainEvent);
    await flush();

    expect(isDestroyed).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
