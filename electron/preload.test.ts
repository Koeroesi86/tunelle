// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, payload: unknown) => void>();
const send = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { send, on: (channel: string, handler: (event: unknown, payload: unknown) => void) => handlers.set(channel, handler) },
  webUtils: { getPathForFile: vi.fn() },
}));

// the ids are the contract with client/components/layout/loading-splash/LoadingSplash.tsx
const splash = `
  <div id="splash">
    <div id="splash-status"></div>
    <div id="splash-progress-track" hidden><div id="splash-progress-bar" style="width: 0%"></div></div>
    <div id="splash-actions" style="display: none"><button></button><button></button></div>
  </div>`;

const emit = (channel: string, payload: unknown) => handlers.get(channel)?.({}, payload);
const element = (id: string) => document.getElementById(id);

describe('preload splash', () => {
  beforeEach(async () => {
    handlers.clear();
    send.mockClear();
    document.body.innerHTML = splash;
    vi.resetModules();
    await import('./preload');
  });

  it('shows the text of the main process, and the progress only when there is one', () => {
    emit('SPLASH_PROGRESS', { text: 'Downloading 26.11.84', percent: 40 });

    expect(element('splash-status')?.textContent).toBe('Downloading 26.11.84');
    expect(element('splash-progress-track')?.hidden).toBe(false);
    expect(element('splash-progress-bar')?.style.width).toBe('40%');

    emit('SPLASH_PROGRESS', { text: 'Starting' });

    expect(element('splash-progress-track')?.hidden).toBe(true);
    expect(element('splash-progress-bar')?.style.width).toBe('0%');
  });

  it('asks the question with the two buttons, and hides the progress', () => {
    emit('SPLASH_PROGRESS', { text: 'Downloading', percent: 10 });
    emit('SPLASH_QUESTION', { text: 'Version 26.11.84 is available', download: 'Download', notNow: 'Not now' });

    const [download, notNow] = Array.from(document.querySelectorAll('#splash-actions button'));
    expect(element('splash-status')?.textContent).toBe('Version 26.11.84 is available');
    expect(element('splash-progress-track')?.hidden).toBe(true);
    expect(element('splash-actions')?.style.display).toBe('flex');
    expect([download?.textContent, notNow?.textContent]).toEqual(['Download', 'Not now']);
  });

  it.each([
    ['Download', 0, true],
    ['Not now', 1, false],
  ])('answers the main process when "%s" is pressed, and hides the buttons', (_label, index, answer) => {
    emit('SPLASH_QUESTION', { text: 'Version 26.11.84 is available', download: 'Download', notNow: 'Not now' });

    document.querySelectorAll<HTMLButtonElement>('#splash-actions button')[index]?.click();

    expect(send).toHaveBeenCalledExactlyOnceWith('SPLASH_ANSWER', { download: answer });
    expect(element('splash-actions')?.style.display).toBe('none');
  });

  it('does nothing once the splash is gone from the page', () => {
    document.body.innerHTML = '';

    expect(() => {
      emit('SPLASH_PROGRESS', { text: 'late', percent: 1 });
      emit('SPLASH_QUESTION', { text: 'late', download: 'a', notNow: 'b' });
    }).not.toThrow();
  });
});
