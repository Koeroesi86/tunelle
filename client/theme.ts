import type { ThemeMode, ThemeSettings } from '../types/theme';
import { autoAccent } from './constants/theme';
import { toHex } from '../shared/utils/to-hex';

export type ResolvedTheme = 'light' | 'dark';

export const defaultAccent = '#ff8686';

/** Colours picked to read on both themes, the settings offer them next to a custom one */
export const accentPresets = [defaultAccent, '#5aa9ff', '#4cc38a', '#f5b942', '#b48cff', '#2ec4b6'];

export const defaultTheme: ThemeSettings = { mode: 'system', accent: undefined };

/** The panel colours of components/theme-provider/ThemeProvider.scss, which text in the accent has to stand out from */
export const panelSurfaces: Record<ResolvedTheme, string> = { dark: '#333333', light: '#fafafa' };

/** WCAG contrast for normal text */
const minTextContrast = 4.5;

const modes: ThemeMode[] = ['system', 'light', 'dark'];

const parseMode = (value: unknown): ThemeMode => modes.find((mode) => mode === value) ?? defaultTheme.mode;

/** The accent as lower case `#rrggbb` or `auto`, undefined for anything else so it falls back to the default */
export const parseAccent = (value: unknown): string | undefined => {
  if (value === autoAccent) return autoAccent;

  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
};

/** The saved theme, with every part that is not valid replaced by its default */
export const restoreTheme = (value: unknown): ThemeSettings =>
  typeof value === 'object' && value !== null
    ? { mode: parseMode('mode' in value ? value.mode : undefined), accent: parseAccent('accent' in value ? value.accent : undefined) }
    : defaultTheme;

/** The theme to show: the picked mode, or the one of the system */
export const resolveTheme = (mode: ThemeMode, systemDark: boolean): ResolvedTheme => (mode === 'system' ? (systemDark ? 'dark' : 'light') : mode);

const channels = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

/** The colour `amount` (0 to 1) of the way from one colour to the other */
const mix = (from: string, to: string, amount: number) => {
  const target = channels(to);
  return toHex(channels(from).map((channel, index) => channel + (target[index] - channel) * amount));
};

const toLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const [red, green, blue] = channels(hex).map(toLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const contrastRatio = (first: string, second: string) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

/** Black or white, whichever reads better on the colour (for a label on an accent background) */
export const pickContrastColor = (background: string) => (contrastRatio(background, '#ffffff') >= contrastRatio(background, '#000000') ? '#ffffff' : '#000000');

/** The accent, moved toward white on dark panels and toward black on light ones just far enough to be readable as text there */
export const readableAccent = (accent: string, theme: ResolvedTheme) => {
  const toward = theme === 'dark' ? '#ffffff' : '#000000';

  return (
    Array.from({ length: 21 }, (_, step) => mix(accent, toward, step / 20)).find(
      (candidate) => contrastRatio(candidate, panelSurfaces[theme]) >= minTextContrast
    ) ?? toward
  );
};

/** The custom properties the accent sets on the root element, the rest of the theme is in the stylesheet */
export const accentTokens = (accent: string | undefined, theme: ResolvedTheme) => {
  const readable = readableAccent(accent ?? defaultAccent, theme);

  return { '--accent': readable, '--accent-contrast': pickContrastColor(readable) };
};
