import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listenerContext';
import registerHistoryListeners from './registerHistoryListeners';
import { createTestDatabase } from '../test-database';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));

const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
const key = { source: 'radio', kind: 'station', id: 'abc' };

describe('registerHistoryListeners', () => {
  const send = vi.fn();
  const event = { sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent;
  let sent: Promise<unknown>;

  beforeEach(async () => {
    listeners.clear();
    send.mockReset();
    sent = new Promise((resolve) => send.mockImplementation(resolve));
    registerHistoryListeners({
      database: await createTestDatabase(),
      radio: { findStations: async () => [station] },
    } as unknown as ListenerContext);
  });

  const lastHistory = () => send.mock.calls.at(-1)?.[1].history;

  it('sends the history when the window asks for it', async () => {
    listeners.get('HISTORY_LOAD')?.(event);
    await sent;

    expect(send).toHaveBeenCalledWith('HISTORY', { history: [] });
  });

  it('records what is played and sends the history with its availability', async () => {
    listeners.get('HISTORY_RECORD')?.(event, { ...key, snapshot: station });
    await sent;

    expect(lastHistory()).toEqual([expect.objectContaining({ ...key, snapshot: station, available: true })]);
  });

  it('clears the history and sends the empty list', async () => {
    listeners.get('HISTORY_RECORD')?.(event, { ...key, snapshot: station });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    listeners.get('HISTORY_CLEAR')?.(event);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));

    expect(lastHistory()).toEqual([]);
  });

  it.each([undefined, null, 'text', {}, { ...key, id: '' }, { ...key, id: 1 }, { ...key, snapshot: 'text' }, { ...key, snapshot: null }])(
    'ignores the malformed record %j',
    async (payload) => {
      listeners.get('HISTORY_RECORD')?.(event, payload);
      listeners.get('HISTORY_LOAD')?.(event);
      await sent;

      expect(send).toHaveBeenCalledTimes(1);
      expect(lastHistory()).toEqual([]);
    }
  );

  it('does not send to a window that was closed meanwhile', async () => {
    const isDestroyed = vi.fn(() => true);
    listeners.get('HISTORY_LOAD')?.({ sender: { send, isDestroyed } } as unknown as IpcMainEvent);
    await vi.waitFor(() => expect(isDestroyed).toHaveBeenCalled());

    expect(send).not.toHaveBeenCalled();
  });
});
