import { afterEach, describe, expect, it, vi } from 'vitest';
import { hideSplash, onAppStarted } from './startup';

describe('onAppStarted', () => {
  it('asks whether the app has started, and starts once however many times it is told', () => {
    const listeners: Array<() => void> = [];
    const api = { on: vi.fn((_channel: string, listener: () => void) => void listeners.push(listener)), send: vi.fn() };
    const start = vi.fn();

    onAppStarted(api, start);
    listeners.forEach((listener) => listener());
    listeners.forEach((listener) => listener());

    expect(api.on).toHaveBeenCalledWith('APP_STARTED', expect.any(Function));
    expect(api.send).toHaveBeenCalledWith('STARTUP_STATUS');
    expect(start).toHaveBeenCalledOnce();
  });

  it('does not start before it is told', () => {
    const start = vi.fn();

    onAppStarted({ on: vi.fn(), send: vi.fn() }, start);

    expect(start).not.toHaveBeenCalled();
  });
});

describe('hideSplash', () => {
  afterEach(() => document.body.replaceChildren());

  it('fades the splash out, then takes it out of the page', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="splash"></div>';

    hideSplash();

    expect(document.getElementById('splash')?.style.opacity).toBe('0');
    vi.runAllTimers();
    expect(document.getElementById('splash')).toBeNull();
    vi.useRealTimers();
  });

  it('does nothing once the splash is gone', () => {
    expect(() => hideSplash()).not.toThrow();
  });
});
