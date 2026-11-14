import { existsSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readMainSettings } from '@shared/schemas/settings';

/** The page tells itself the window is transparent through this argument (`electronAPI.transparent`) */
export const transparentArgument = '--window-transparent';

const markerPath = (appDataPath: string) => join(appDataPath, 'window-transparent');

/** The window opens before the library does, so the choice of the translucent panels is kept in a file next to it. See docs/app/window-blur.md */
const isDesktopBlurSaved = (appDataPath: string) => existsSync(markerPath(appDataPath));

/** A window is transparent where the system blurs it (macOS) or the user said the desktop does; it changes with the next start, as Electron cannot change it afterwards */
export const isWindowTransparent = (blurredBySystem: boolean, appDataPath: string) => blurredBySystem || isDesktopBlurSaved(appDataPath);

export const getTransparencyArguments = (transparent: boolean) => (transparent ? [transparentArgument] : []);

export const saveDesktopBlur = (appDataPath: string, settings: unknown) => {
  if (readMainSettings(settings).desktopBlur) writeFileSync(markerPath(appDataPath), '');
  else rmSync(markerPath(appDataPath), { force: true });
};
