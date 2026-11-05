import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import closeSplash from './closeSplash';

const fakeWindow = (destroyed = false) => ({ close: vi.fn(), destroy: vi.fn(), isDestroyed: () => destroyed });

describe('closeSplash', () => {
  it('destroys the splash that is open, as a pending close would keep the app from quitting', () => {
    const splash = fakeWindow();
    const windows = { main: null, loading: splash as unknown as BrowserWindow };

    closeSplash(windows);

    expect(splash.destroy).toHaveBeenCalledOnce();
    expect(splash.close).not.toHaveBeenCalled();
    expect(windows.loading).toBeNull();
  });

  it('leaves a splash that is gone alone', () => {
    const splash = fakeWindow(true);
    const windows = { main: null, loading: splash as unknown as BrowserWindow };

    closeSplash(windows);

    expect(splash.destroy).not.toHaveBeenCalled();
    expect(windows.loading).toBeNull();
  });

  it('has nothing to do without a splash', () => {
    const windows = { main: null, loading: null };

    expect(() => closeSplash(windows)).not.toThrow();
  });
});
