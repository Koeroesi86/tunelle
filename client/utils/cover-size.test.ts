import { describe, expect, it } from 'vitest';
import { coverSizes, restoreCoverSize } from './cover-size';

describe('restoreCoverSize', () => {
  it('keeps a size of the range', () => {
    expect(restoreCoverSize(120)).toBe(120);
    expect(restoreCoverSize(200)).toBe(200);
    expect(restoreCoverSize(240)).toBe(240);
  });

  it('keeps a size inside the range and on a step', () => {
    expect(restoreCoverSize(10)).toBe(coverSizes.min);
    expect(restoreCoverSize(5000)).toBe(coverSizes.max);
    expect(restoreCoverSize(163)).toBe(160);
  });

  it.each([['wide'], [undefined], [null], [Number.NaN], [Infinity], [{}]])('gives the default for %s', (value) => {
    expect(restoreCoverSize(value)).toBe(coverSizes.default);
  });
});
