import type { BrowserWindow } from 'electron';

/** What the app blurs behind the translucent parts of a window: macOS vibrancy, nothing elsewhere (a blur from the desktop is the user's setting) */
export type WindowBackdrop = 'vibrancy' | 'none';

/** The preload script tells the page about it (`electronAPI.blurred`) through this argument */
export const blurArgument = '--window-blur';

/** Electron can only blur behind a window on macOS; on Linux and Windows the desktop has to do it, which the app cannot detect */
export const getWindowBackdrop = (platform: NodeJS.Platform): WindowBackdrop => (platform === 'darwin' ? 'vibrancy' : 'none');

export const getBackdropArguments = (backdrop: WindowBackdrop) => (backdrop === 'none' ? [] : [blurArgument]);

export const applyWindowBackdrop = (window: BrowserWindow, backdrop: WindowBackdrop) => {
  if (backdrop === 'vibrancy') window.setVibrancy('under-window');
};
