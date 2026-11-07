import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerRadioListeners from './register-radio-listeners';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));

describe('registerRadioListeners when the directory does not answer', () => {
  const event = { sender: { send: vi.fn() } } as unknown as IpcMainEvent;
  const failure = new TypeError('fetch failed', { cause: new Error('read ECONNRESET') });
  const getOptions = vi.fn();
  const getTags = vi.fn();
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    listeners.clear();
    getOptions.mockReset().mockRejectedValue(failure);
    getTags.mockReset().mockRejectedValue(failure);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerRadioListeners({ radio: { getOptions, getTags } } as unknown as ListenerContext);
  });

  afterEach(() => warn.mockRestore());

  it('says in one line which list is missing and why, instead of dumping the error', async () => {
    listeners.get('RADIO_OPTIONS')?.(event);
    listeners.get('RADIO_TAGS')?.(event);

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(4));
    expect(warn.mock.calls.map(([line]) => line)).toEqual(
      expect.arrayContaining([
        'The radio directory did not answer for the list of countries: fetch failed: read ECONNRESET',
        'The radio directory did not answer for the list of languages: fetch failed: read ECONNRESET',
        'The radio directory did not answer for the list of codecs: fetch failed: read ECONNRESET',
        'The radio directory did not answer for the tags: fetch failed: read ECONNRESET',
      ])
    );
  });
});
