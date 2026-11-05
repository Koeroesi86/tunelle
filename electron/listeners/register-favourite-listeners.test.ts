import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerFavouriteListeners from './register-favourite-listeners';
import { createTestDatabase } from '../test-database';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));

const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
const key = { source: 'radio', kind: 'station', id: 'abc' };

describe('registerFavouriteListeners', () => {
  const send = vi.fn();
  const event = { sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent;
  let sent: Promise<unknown>;

  beforeEach(async () => {
    listeners.clear();
    send.mockReset();
    sent = new Promise((resolve) => send.mockImplementation(resolve));
    registerFavouriteListeners({
      database: await createTestDatabase(),
      radio: { findStations: async () => [station] },
    } as unknown as ListenerContext);
  });

  const lastFavourites = () => send.mock.calls.at(-1)?.[1].favourites;

  it('sends the favourites when the window asks for them', async () => {
    listeners.get('FAVOURITES_LOAD')?.(event);
    await sent;

    expect(send).toHaveBeenCalledWith('FAVOURITES', { favourites: [] });
  });

  it('stores a favourite and sends the list with its availability', async () => {
    listeners.get('FAVOURITE_ADD')?.(event, { ...key, snapshot: station });
    await sent;

    expect(lastFavourites()).toEqual([expect.objectContaining({ ...key, snapshot: station, available: true })]);
  });

  it('removes a favourite and sends the list', async () => {
    listeners.get('FAVOURITE_ADD')?.(event, { ...key, snapshot: station });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    listeners.get('FAVOURITE_REMOVE')?.(event, key);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));

    expect(lastFavourites()).toEqual([]);
  });

  it.each([undefined, null, 'text', {}, { ...key, id: '' }, { ...key, id: 1 }, { ...key, snapshot: 'text' }, { ...key, snapshot: null }])(
    'ignores the malformed addition %j',
    async (payload) => {
      listeners.get('FAVOURITE_ADD')?.(event, payload);
      listeners.get('FAVOURITES_LOAD')?.(event);
      await sent;

      expect(send).toHaveBeenCalledTimes(1);
      expect(lastFavourites()).toEqual([]);
    }
  );

  it('does not send to a window that was closed meanwhile', async () => {
    const isDestroyed = vi.fn(() => true);
    listeners.get('FAVOURITES_LOAD')?.({ sender: { send, isDestroyed } } as unknown as IpcMainEvent);
    await vi.waitFor(() => expect(isDestroyed).toHaveBeenCalled());

    expect(send).not.toHaveBeenCalled();
  });
});
