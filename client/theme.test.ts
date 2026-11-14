import { describe, expect, it } from 'vitest';
import type { ThemeMode } from '@shared/types/theme';
import {
  accentPresets,
  accentTokens,
  contrastRatio,
  defaultAccent,
  defaultTheme,
  accentSurfaces,
  parseAccent,
  pickContrastColor,
  readableAccent,
  resolveTheme,
  restoreTheme,
} from './theme';
import type { ResolvedTheme } from './theme';

describe('resolveTheme', () => {
  it.each<[ThemeMode, boolean, ResolvedTheme]>([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
  ])('%s with a dark system %s is %s', (mode, systemDark, expected) => {
    expect(resolveTheme(mode, systemDark)).toBe(expected);
  });
});

describe('parseAccent', () => {
  it('keeps a #rrggbb colour in lower case', () => {
    expect(parseAccent('#FF8686')).toBe('#ff8686');
    expect(parseAccent('#0a1b2c')).toBe('#0a1b2c');
  });

  it('keeps the automatic setting', () => {
    expect(parseAccent('auto')).toBe('auto');
    expect(restoreTheme({ mode: 'dark', accent: 'auto' })).toEqual({ mode: 'dark', accent: 'auto' });
  });

  it.each([undefined, null, 1, '', 'red', '#fff', '#ff868', '#ff86866', 'ff8686', '#gg8686', 'rgb(1,2,3)'])('falls back to the default for %j', (value) => {
    expect(parseAccent(value)).toBeUndefined();
  });
});

describe('restoreTheme', () => {
  it('restores a saved theme', () => {
    expect(restoreTheme({ mode: 'dark', accent: '#5AA9FF' })).toEqual({ mode: 'dark', accent: '#5aa9ff' });
  });

  it('follows the system with the default accent when nothing was saved', () => {
    expect(restoreTheme(undefined)).toEqual(defaultTheme);
    expect(restoreTheme({})).toEqual(defaultTheme);
  });

  it('replaces each part that is not valid with its default', () => {
    expect(restoreTheme({ mode: 'sepia', accent: 'pink' })).toEqual(defaultTheme);
    expect(restoreTheme({ mode: 'light', accent: 42 })).toEqual({ mode: 'light', accent: undefined });
    expect(restoreTheme(null)).toEqual(defaultTheme);
    expect(restoreTheme('dark')).toEqual(defaultTheme);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for the same colour, in either order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1);
  });
});

describe('pickContrastColor', () => {
  it.each([
    ['#000000', '#ffffff'],
    ['#333333', '#ffffff'],
    ['#ffffff', '#000000'],
    ['#ffff00', '#000000'],
    ['#ff8686', '#000000'],
    ['#0000ff', '#ffffff'],
  ])('puts %s text color on %s', (background, expected) => {
    expect(pickContrastColor(background)).toBe(expected);
  });

  it.each(accentPresets)('keeps a label on %s readable', (preset) => {
    expect(contrastRatio(preset, pickContrastColor(preset))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('readableAccent', () => {
  it('keeps the default accent as it is on dark panels', () => {
    expect(readableAccent(defaultAccent, 'dark')).toBe(defaultAccent);
  });

  it('darkens an accent that is too light for light panels', () => {
    const readable = readableAccent(defaultAccent, 'light');

    expect(readable).not.toBe(defaultAccent);
    expect(contrastRatio(readable, accentSurfaces.light)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(accentPresets.flatMap((preset) => (['dark', 'light'] as const).map((theme) => [preset, theme] as const)))(
    'reads %s on %s panels',
    (preset, theme) => {
      expect(contrastRatio(readableAccent(preset, theme), accentSurfaces[theme])).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each(['#000000', '#ffffff', '#808080', '#ffff00', '#0000ff', '#010101', '#fefefe'])('reads the extreme %s in both modes', (accent) => {
    expect(contrastRatio(readableAccent(accent, 'dark'), accentSurfaces.dark)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(readableAccent(accent, 'light'), accentSurfaces.light)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('accentTokens', () => {
  it('uses the default accent without a picked one', () => {
    expect(accentTokens(undefined, 'dark')).toEqual({ '--accent': defaultAccent, '--accent-contrast': '#000000' });
  });

  it('gives a label on the accent the color that reads on it', () => {
    const { '--accent': accent, '--accent-contrast': label } = accentTokens('#0000ff', 'dark');

    expect(contrastRatio(accent, label)).toBeGreaterThanOrEqual(4.5);
  });
});
