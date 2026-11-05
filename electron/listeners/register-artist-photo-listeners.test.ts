import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerArtistPhotoListeners from './register-artist-photo-listeners';
import { createTestDatabase } from '../test-database';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();
const enqueue = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));
vi.mock('../services/artist-photos', () => ({ createArtistPhotoQueue: () => ({ enqueue }) }));

describe('registerArtistPhotoListeners', () => {
  const event = { sender: { send: vi.fn(), isDestroyed: () => false } } as unknown as IpcMainEvent;
  let context: ListenerContext;

  beforeEach(async () => {
    listeners.clear();
    enqueue.mockReset().mockResolvedValue(undefined);
    context = { database: await createTestDatabase() } as unknown as ListenerContext;
  });

  it('looks up the names a window asks for, and leaves out what is not a name', () => {
    registerArtistPhotoListeners(context, {});

    listeners.get('ARTIST_PHOTOS_WANTED')?.(event, { artists: [{ key: 'adam', name: 'Adam' }, { key: 1 }, 'x', { name: 'No key' }] });

    expect(enqueue).toHaveBeenCalledExactlyOnceWith([{ key: 'adam', name: 'Adam' }]);
  });

  it('asks for nothing from a request that is not a list', () => {
    registerArtistPhotoListeners(context, {});

    listeners.get('ARTIST_PHOTOS_WANTED')?.(event, 'adam');
    listeners.get('ARTIST_PHOTOS_WANTED')?.(event, { artists: 'adam' });

    expect(enqueue).toHaveBeenNthCalledWith(1, []);
    expect(enqueue).toHaveBeenNthCalledWith(2, []);
  });

  it('does not listen when TUNELLE_NO_ARTIST_PHOTOS is 1', () => {
    registerArtistPhotoListeners(context, { TUNELLE_NO_ARTIST_PHOTOS: '1' });

    expect(listeners.size).toBe(0);
  });
});
