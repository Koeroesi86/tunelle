import { describe, expect, it } from 'vitest';
import { clamp } from './clamp';

describe('clamp', () => {
  it.each([
    [5, 0, 10, 5],
    [-3, 0, 10, 0],
    [14, 0, 10, 10],
    [0, 0, 10, 0],
    [10, 0, 10, 10],
  ])('keeps %d between %d and %d: %d', (value, least, most, expected) => {
    expect(clamp(value, least, most)).toBe(expected);
  });

  it('lets the least win when the range is the wrong way round', () => {
    expect(clamp(2, 4, 1)).toBe(4);
  });
});
