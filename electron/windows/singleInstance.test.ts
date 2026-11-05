import { describe, expect, it, vi } from 'vitest';
import { focusWindow, holdSingleInstance } from './singleInstance';

const createWindow = (minimized: boolean) => ({ isMinimized: vi.fn(() => minimized), restore: vi.fn(), show: vi.fn(), focus: vi.fn() });

const createApp = (lock: boolean) => ({ requestSingleInstanceLock: vi.fn(() => lock), on: vi.fn() });

describe('focusWindow', () => {
  it('shows and focuses a window', () => {
    const window = createWindow(false);

    focusWindow(window);

    expect(window.restore).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });

  it('restores a minimized window first', () => {
    const window = createWindow(true);

    focusWindow(window);

    expect(window.restore).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });

  it('does nothing without a window', () => {
    expect(() => focusWindow(null)).not.toThrow();
  });
});

describe('holdSingleInstance', () => {
  it('carries on and answers a later start with the window of the running one', () => {
    const app = createApp(true);
    const window = createWindow(false);
    const exit = vi.fn();

    holdSingleInstance(app, () => window, exit);

    expect(exit).not.toHaveBeenCalled();
    expect(app.on).toHaveBeenCalledWith('second-instance', expect.any(Function));

    app.on.mock.calls[0][1]();

    expect(window.focus).toHaveBeenCalled();
  });

  it('asks for the window when the later start comes, not when the lock is taken', () => {
    const app = createApp(true);
    const getWindow = vi.fn(() => createWindow(false));

    holdSingleInstance(app, getWindow, vi.fn());
    expect(getWindow).not.toHaveBeenCalled();

    app.on.mock.calls[0][1]();
    expect(getWindow).toHaveBeenCalledTimes(1);
  });

  it('leaves at once when another start holds the lock', () => {
    const app = createApp(false);
    const exit = vi.fn();

    holdSingleInstance(app, () => null, exit);

    expect(exit).toHaveBeenCalledWith(0);
    expect(app.on).not.toHaveBeenCalled();
  });
});
