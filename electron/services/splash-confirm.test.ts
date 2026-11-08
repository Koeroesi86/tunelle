import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainEvent } from 'electron';
import { askOnSplash } from './splash-confirm';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Set<Listener>();

vi.mock('electron', () => ({
  ipcMain: { on: (_channel: string, listener: Listener) => listeners.add(listener), off: (_channel: string, listener: Listener) => listeners.delete(listener) },
}));

const question = { text: 'Metered. Download 2.0.0?', download: 'Download', notNow: 'Not now' };

const setup = () => {
  const webContents = { send: vi.fn() };
  const splash = Object.assign(new EventEmitter(), { webContents }) as unknown as BrowserWindow;
  const press = (payload: unknown, sender: unknown = webContents) => listeners.forEach((listener) => listener({ sender } as IpcMainEvent, payload));

  return { splash, webContents, press };
};

describe('askOnSplash', () => {
  beforeEach(() => listeners.clear());

  it('sends the question to the splash', () => {
    const { splash, webContents } = setup();

    void askOnSplash(splash, question);

    expect(webContents.send).toHaveBeenCalledExactlyOnceWith('SPLASH_QUESTION', question);
  });

  it.each([true, false])('answers with the button pressed (download: %s) and stops listening', async (download) => {
    const { splash, press } = setup();
    const answer = askOnSplash(splash, question);

    press({ download });

    await expect(answer).resolves.toBe(download);
    expect(listeners.size).toBe(0);
    expect(splash.listenerCount('closed')).toBe(0);
  });

  it('ignores a message of another window and a malformed one', async () => {
    const { splash, press } = setup();
    const answer = askOnSplash(splash, question);

    press({ download: true }, {});
    press({ download: 'yes' });
    press(undefined);
    expect(listeners.size).toBe(1);

    press({ download: false });
    await expect(answer).resolves.toBe(false);
  });

  it('counts a closed splash as not now', async () => {
    const { splash } = setup();
    const answer = askOnSplash(splash, question);

    splash.emit('closed');

    await expect(answer).resolves.toBe(false);
    expect(listeners.size).toBe(0);
  });
});
