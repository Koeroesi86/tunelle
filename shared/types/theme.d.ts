/** System follows the operating system, light and dark override it */
export type ThemeMode = 'system' | 'light' | 'dark';

/** The look picked in the settings */
export interface ThemeSettings {
  mode: ThemeMode;
  /** The highlight colour as `#rrggbb`, `auto` for the colour of the cover that plays, undefined is the default accent */
  accent: string | undefined;
}
