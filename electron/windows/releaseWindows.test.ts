import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import releaseWindows from './releaseWindows';

const fakeWindow = (destroyed = false) => ({ destroy: vi.fn(), isDestroyed: () => destroyed });

describe('releaseWindows', () => {
  it('takes down the splash that is still open, so the app has no window left and quits', () => {
    const splash = fakeWindow();
    const windows = { main: fakeWindow() as unknown as BrowserWindow, loading: splash as unknown as BrowserWindow };

    releaseWindows(windows);

    expect(splash.destroy).toHaveBeenCalledOnce();
    expect(windows).toEqual({ main: null, loading: null });
  });

  it('leaves a splash that is gone alone', () => {
    const splash = fakeWindow(true);
    const windows = { main: null, loading: splash as unknown as BrowserWindow };

    releaseWindows(windows);

    expect(splash.destroy).not.toHaveBeenCalled();
    expect(windows.loading).toBeNull();
  });

  it('has nothing to close once the main window showed and the splash was let go', () => {
    const windows = { main: fakeWindow() as unknown as BrowserWindow, loading: null };

    expect(() => releaseWindows(windows)).not.toThrow();
    expect(windows).toEqual({ main: null, loading: null });
  });
});
