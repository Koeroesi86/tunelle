import { release } from 'os';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import {
  applyWindowBackdrop,
  blurArgument,
  getBackdropArguments,
  getWindowBackdrop,
  getWindowBackground,
  isWindowTransparent,
  opaqueArgument,
} from './window-backdrop';

vi.mock('os', () => ({ release: vi.fn(() => '6.8.0') }));
vi.mock('electron', () => ({ nativeTheme: { shouldUseDarkColors: true } }));

describe('getWindowBackdrop', () => {
  it('is vibrancy on macOS', () => {
    expect(getWindowBackdrop('darwin')).toBe('vibrancy');
  });

  it('is none on Linux', () => {
    expect(getWindowBackdrop('linux')).toBe('none');
  });

  it('is the material on Windows 11 22H2 and later', () => {
    vi.mocked(release).mockReturnValueOnce('10.0.22621');
    expect(getWindowBackdrop('win32')).toBe('material');
  });

  it('is none on Windows 10 and the first Windows 11', () => {
    vi.mocked(release).mockReturnValue('10.0.19045');
    expect(getWindowBackdrop('win32')).toBe('none');
    vi.mocked(release).mockReturnValue('10.0.22000');
    expect(getWindowBackdrop('win32')).toBe('none');
    vi.mocked(release).mockReturnValue('6.8.0');
  });
});

describe('getBackdropArguments', () => {
  it('tells the page about vibrancy', () => {
    expect(getBackdropArguments('vibrancy', 'darwin')).toEqual([blurArgument]);
    expect(getBackdropArguments('material', 'win32')).toEqual([blurArgument]);
  });

  it('tells the page nothing without a backdrop on a transparent window', () => {
    expect(getBackdropArguments('none', 'linux')).toEqual([]);
  });

  it('tells the page that a window without a backdrop on Windows is opaque', () => {
    expect(getBackdropArguments('none', 'win32')).toEqual([opaqueArgument]);
  });
});

describe('isWindowTransparent', () => {
  it('is false only on Windows, where a transparent window cannot snap', () => {
    expect(['win32', 'linux', 'darwin'].map((platform) => isWindowTransparent(platform as NodeJS.Platform))).toEqual([false, true, true]);
  });
});

describe('getWindowBackground', () => {
  it('is clear for the material', () => {
    expect(getWindowBackground('material', 'win32')).toEqual({ backgroundColor: '#00000000' });
  });

  it('is the solid colour of the theme for an opaque window', () => {
    expect(getWindowBackground('none', 'win32')).toEqual({ backgroundColor: '#1f1f1f' });
  });

  it('is left out for a transparent window', () => {
    expect(getWindowBackground('none', 'linux')).toEqual({});
  });
});

describe('applyWindowBackdrop', () => {
  const run = (backdrop: Parameters<typeof applyWindowBackdrop>[1]) => {
    const setVibrancy = vi.fn();
    const setBackgroundMaterial = vi.fn();
    applyWindowBackdrop({ setVibrancy, setBackgroundMaterial } as unknown as BrowserWindow, backdrop);
    return { setVibrancy, setBackgroundMaterial };
  };

  it('sets vibrancy for vibrancy', () => {
    expect(run('vibrancy').setVibrancy).toHaveBeenCalledWith('under-window');
  });

  it('sets the acrylic material for material', () => {
    expect(run('material').setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
  });

  it('leaves the window alone without a backdrop', () => {
    const { setVibrancy, setBackgroundMaterial } = run('none');
    expect(setVibrancy).not.toHaveBeenCalled();
    expect(setBackgroundMaterial).not.toHaveBeenCalled();
  });
});
