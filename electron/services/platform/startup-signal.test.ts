import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, (event: { sender: unknown }) => void>();

vi.mock('electron', () => ({ ipcMain: { on: (channel: string, listener: (event: { sender: unknown }) => void) => listeners.set(channel, listener) } }));

const { createStartupSignal } = await import('./startup-signal');

const setup = () => {
  const webContents = { send: vi.fn(), isDestroyed: () => false };

  return { webContents, signal: createStartupSignal({ webContents } as unknown as BrowserWindow) };
};

describe('createStartupSignal', () => {
  beforeEach(() => listeners.clear());

  it('tells the page when the app has started', () => {
    const { webContents, signal } = setup();

    signal.start();

    expect(webContents.send).toHaveBeenCalledExactlyOnceWith('APP_STARTED', undefined);
  });

  it('answers a page that loaded after the app started, and stays quiet before that', () => {
    const { webContents, signal } = setup();
    const ask = () => listeners.get('STARTUP_STATUS')?.({ sender: webContents });

    ask();
    expect(webContents.send).not.toHaveBeenCalled();

    signal.start();
    ask();
    expect(webContents.send).toHaveBeenCalledTimes(2);
  });

  it('does not answer another window', () => {
    const { webContents, signal } = setup();
    signal.start();
    webContents.send.mockClear();

    listeners.get('STARTUP_STATUS')?.({ sender: {} });

    expect(webContents.send).not.toHaveBeenCalled();
  });
});
