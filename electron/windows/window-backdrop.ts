import { release } from 'os';
import { nativeTheme, type BrowserWindow } from 'electron';

/** What the app blurs behind the translucent parts of a window: macOS vibrancy, the acrylic material of Windows 11, nothing elsewhere (a blur from the desktop is the user's setting) */
type WindowBackdrop = 'vibrancy' | 'material' | 'none';

/** Electron needs Windows 11 22H2 (build 22621) for `setBackgroundMaterial` */
const minMaterialBuild = 22621;

/** The preload script tells the page about it (`electronAPI.blurred`) through this argument */
export const blurArgument = '--window-blur';

/** The page learns through this argument that its window has no transparency (Windows 10), so it offers no translucent panels */
export const opaqueArgument = '--window-opaque';

/** A transparent window has no native frame on Windows, which breaks Aero Snap, so Windows windows are never transparent. See docs/app/window-snap.md */
export const isWindowTransparent = (platform: NodeJS.Platform) => platform !== 'win32';

const hasWindowsMaterial = () => Number(release().split('.')[2]) >= minMaterialBuild;

/** Electron can blur behind a window on macOS and on Windows 11; on Linux and Windows 10 the desktop has to do it, which the app cannot detect */
export const getWindowBackdrop = (platform: NodeJS.Platform): WindowBackdrop => {
  if (platform === 'darwin') return 'vibrancy';
  return platform === 'win32' && hasWindowsMaterial() ? 'material' : 'none';
};

export const getBackdropArguments = (backdrop: WindowBackdrop, platform: NodeJS.Platform) => {
  if (backdrop !== 'none') return [blurArgument];
  return isWindowTransparent(platform) ? [] : [opaqueArgument];
};

export const applyWindowBackdrop = (window: BrowserWindow, backdrop: WindowBackdrop) => {
  if (backdrop === 'vibrancy') window.setVibrancy('under-window');
  if (backdrop === 'material') window.setBackgroundMaterial('acrylic');
};

/** A transparent window has no background of its own; the material shows through a clear one, and an opaque Windows 10 window has the solid background of the theme (`--app-background`) */
export const getWindowBackground = (backdrop: WindowBackdrop, platform: NodeJS.Platform) => {
  if (backdrop === 'material') return { backgroundColor: '#00000000' };
  if (isWindowTransparent(platform)) return {};
  return { backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1f1f' : '#f2f2f2' };
};
