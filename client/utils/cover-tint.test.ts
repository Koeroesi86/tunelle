import { describe, expect, it } from 'vitest';
import { getTint } from './cover-tint';

const pixels = (...colors: number[][]) => Uint8ClampedArray.from(colors.flat());

describe('getTint', () => {
  it('takes the color of a uniform image', () => {
    expect(getTint(pixels([40, 20, 10, 255], [40, 20, 10, 255]))).toBe('rgb(40, 20, 10)');
  });

  it('darkens a bright image so white text stays readable', () => {
    expect(getTint(pixels([255, 255, 255, 255]))).toBe('rgb(71, 71, 71)');
  });

  it('lets a saturated color win over grey pixels', () => {
    const [red] = (getTint(pixels([200, 0, 0, 255], [100, 100, 100, 255], [100, 100, 100, 255])) ?? '').match(/\d+/g) ?? [];

    expect(Number(red)).toBeGreaterThan(Number(getTint(pixels([100, 100, 100, 255]))?.match(/\d+/)?.[0]));
  });

  it('ignores transparent pixels and gives nothing for an empty image', () => {
    expect(getTint(pixels([255, 0, 0, 0]))).toBeUndefined();
    expect(getTint(pixels())).toBeUndefined();
  });
});
