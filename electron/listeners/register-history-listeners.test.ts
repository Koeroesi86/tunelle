import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from 'sqlite3';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerHistoryListeners from './register-history-listeners';
import { clearHistory, getHistory, recordPlayed } from '../repositories/history-repository';
import { withAvailability } from '../library/watch/favourite-availability';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

// what the listeners call is replaced: the database, the repository and the look at the library for the availability
vi.mock('sqlite3', () => ({ Database: class {} }));
vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));
vi.mock('../repositories/history-repository', () => ({ clearHistory: vi.fn(), getHistory: vi.fn(), recordPlayed: vi.fn() }));
vi.mock('../library/watch/favourite-availability', () => ({ withAvailability: vi.fn() }));

const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
const key = { source: 'radio', kind: 'station', id: 'abc' };
const played = [{ ...key, snapshot: station, playedAt: 1 }];

describe('registerHistoryListeners', () => {
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
    vi.mocked(recordPlayed).mockReset().mockResolvedValue(undefined);
    vi.mocked(clearHistory).mockReset().mockResolvedValue([]);
    vi.mocked(getHistory).mockReset().mockResolvedValue(played);
    vi.mocked(withAvailability)
      .mockReset()
      .mockImplementation(async (items) => items.map((item) => ({ ...item, available: true })));
    registerHistoryListeners(context);
  });

  afterEach(() => vi.useRealTimers());

  it('sends the history with its availability when the window asks for it', async () => {
    listeners.get('HISTORY_LOAD')?.(event);
    await flush();

    expect(getHistory).toHaveBeenCalledWith(database);
    expect(withAvailability).toHaveBeenCalledWith(played, context);
    expect(send).toHaveBeenCalledWith('HISTORY', { history: [{ ...played[0], available: true }] });
  });

  it('records what is played and then sends the history', async () => {
    listeners.get('HISTORY_RECORD')?.(event, { ...key, snapshot: station });
    await flush();

    expect(recordPlayed).toHaveBeenCalledWith(database, key, station);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('HISTORY', { history: [{ ...played[0], available: true }] });
  });

  it('clears the history and then sends it', async () => {
    listeners.get('HISTORY_CLEAR')?.(event);
    await flush();

    expect(clearHistory).toHaveBeenCalledWith(database);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, 'text', {}, { ...key, id: '' }, { ...key, id: 1 }, { ...key, snapshot: 'text' }, { ...key, snapshot: null }])(
    'ignores the malformed record %j',
    async (payload) => {
      listeners.get('HISTORY_RECORD')?.(event, payload);
      await flush();

      expect(recordPlayed).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
  );

  it('logs a failure and sends nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(recordPlayed).mockRejectedValue(new Error('disk full'));

    listeners.get('HISTORY_RECORD')?.(event, { ...key, snapshot: station });
    await flush();

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send to a window that was closed meanwhile', async () => {
    const isDestroyed = vi.fn(() => true);
    listeners.get('HISTORY_LOAD')?.({ sender: { send, isDestroyed } } as unknown as IpcMainEvent);
    await flush();

    expect(isDestroyed).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
