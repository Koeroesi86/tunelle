import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { breakpoints, getBreakpoint } from './breakpoints';

// the source of the stylesheet is read, as the stylesheets are stubbed in the unit tests
const scss = readFileSync(resolve(__dirname, '../styles/breakpoints.scss'), 'utf8');

const readPx = (name: string) => Number(new RegExp(`\\$${name}: (\\d+)px;`).exec(scss)?.[1]);

describe('getBreakpoint', () => {
  it.each([
    [360, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [1023, 'medium'],
    [1024, 'expanded'],
    [3440, 'expanded'],
  ] as const)('is %s px wide: %s', (width, expected) => {
    expect(getBreakpoint(width)).toBe(expected);
  });
});

describe('breakpoints.scss', () => {
  it('has the numbers of the constants', () => {
    expect(readPx('medium-min')).toBe(breakpoints.mediumMin);
    expect(readPx('compact-max')).toBe(breakpoints.mediumMin - 1);
    expect(readPx('expanded-min')).toBe(breakpoints.expandedMin);
    expect(readPx('medium-max')).toBe(breakpoints.expandedMin - 1);
  });
});
