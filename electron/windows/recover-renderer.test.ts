import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { recoverRenderer } from './recover-renderer';

const electron = vi.hoisted(() => ({ app: { on: vi.fn(), quit: vi.fn() }, dialog: { showErrorBox: vi.fn() } }));
const opened = vi.hoisted(() => ({ detachOpenedFiles: vi.fn() }));

vi.mock('electron', () => electron);
vi.mock('../library/opened/opened-files', () => opened);
vi.mock('../language', () => ({ getMainTranslator: () => ({ t: (key: string) => key }) }));

type Gone = (event: unknown, details: { reason: string; exitCode: number }) => void;

describe('recoverRenderer', () => {
  const listeners = new Map<string, Gone>();
  const main = {
    webContents: { on: (event: string, listener: Gone) => listeners.set(event, listener), reload: vi.fn() },
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
  };
  const lose = (reason = 'crashed') => {
    listeners.get('render-process-gone')?.({}, { reason, exitCode: 1 });
    vi.advanceTimersByTime(0);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.clearAllMocks();
    recoverRenderer(main as unknown as BrowserWindow);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['crashed', 'killed', 'oom'])('loads the page again when its process is gone (%s)', (reason) => {
    lose(reason);

    expect(opened.detachOpenedFiles).toHaveBeenCalled();
    expect(main.webContents.reload).toHaveBeenCalledTimes(1);
  });

  it('leaves a page alone that ended by itself', () => {
    lose('clean-exit');

    expect(main.webContents.reload).not.toHaveBeenCalled();
  });

  it('does not load a window again that was closed in the meantime', () => {
    main.isDestroyed.mockReturnValueOnce(true);

    lose();

    expect(main.webContents.reload).not.toHaveBeenCalled();
  });

  // a logout or Ctrl+C ends the page and the app at once
  it('does not load a page again that is gone while the app quits', () => {
    electron.app.on.mock.calls.filter(([event]) => event === 'before-quit').forEach(([, quit]) => quit());

    lose('killed');

    expect(main.webContents.reload).not.toHaveBeenCalled();
  });

  it('closes the app with a message when the page is gone again and again', () => {
    [1, 2, 3, 4].forEach(() => lose());

    expect(main.webContents.reload).toHaveBeenCalledTimes(3);
    expect(electron.dialog.showErrorBox).toHaveBeenCalledWith('crash.title', 'crash.message');
    expect(main.destroy).toHaveBeenCalled();
    expect(electron.app.quit).toHaveBeenCalled();
  });

  it('goes on loading the page when the crashes are far apart', () => {
    [1, 2, 3, 4].forEach(() => {
      lose();
      vi.advanceTimersByTime(60_000);
    });

    expect(main.webContents.reload).toHaveBeenCalledTimes(4);
    expect(electron.app.quit).not.toHaveBeenCalled();
  });
});
