import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { applyWindowBackdrop, blurArgument, getBackdropArguments, getWindowBackdrop } from './windowBackdrop';

describe('getWindowBackdrop', () => {
  it('is vibrancy on macOS', () => {
    expect(getWindowBackdrop('darwin')).toBe('vibrancy');
  });

  it.each<NodeJS.Platform>(['linux', 'win32'])('is none on %s', (platform) => {
    expect(getWindowBackdrop(platform)).toBe('none');
  });
});

describe('getBackdropArguments', () => {
  it('tells the page about vibrancy', () => {
    expect(getBackdropArguments('vibrancy')).toEqual([blurArgument]);
  });

  it('tells the page nothing without a backdrop', () => {
    expect(getBackdropArguments('none')).toEqual([]);
  });
});

describe('applyWindowBackdrop', () => {
  const run = (backdrop: Parameters<typeof applyWindowBackdrop>[1]) => {
    const setVibrancy = vi.fn();
    applyWindowBackdrop({ setVibrancy } as unknown as BrowserWindow, backdrop);
    return setVibrancy;
  };

  it('sets vibrancy for vibrancy', () => {
    expect(run('vibrancy')).toHaveBeenCalledWith('under-window');
  });

  it('leaves the window alone without a backdrop', () => {
    expect(run('none')).not.toHaveBeenCalled();
  });
});
