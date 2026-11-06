import { readMainSettings } from '@shared/schemas/settings';
import { nativeTheme } from 'electron';
import type { ThemeMode } from '@shared/types/theme';

/** The mode of the saved settings, the system one where none was picked or the saved value is not a mode */
export const themeModeOf = (settings: unknown): ThemeMode => {
  return readMainSettings(settings).theme?.mode ?? 'system';
};

/** Matches the native parts (menus, dialogs, scrollbars) and the `prefers-color-scheme` of the pages to the mode of the saved settings */
export const applyThemeMode = (settings: unknown) => {
  nativeTheme.themeSource = themeModeOf(settings);
};

/** Whether the window is dark now, which is the mode of the settings or else the system */
export const isDarkTheme = () => nativeTheme.shouldUseDarkColors;
