import { describe, expect, it } from 'vitest';
import { pickAccent } from './pick-accent';

const pixels = (...colours: [number, number, number, number?][]) => Uint8ClampedArray.from(colours.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

const repeat = (count: number, colour: [number, number, number, number?]) => Array.from({ length: count }, () => colour);

describe('pickAccent', () => {
  it('picks the colour of a cover with one', () => {
    expect(pickAccent(pixels(...repeat(10, [220, 40, 40])))).toBe('#dc2828');
  });

  it('ignores black, white and grey pixels however many there are', () => {
    const cover = pixels(...repeat(50, [0, 0, 0]), ...repeat(50, [255, 255, 255]), ...repeat(50, [128, 128, 128]), ...repeat(3, [40, 120, 220]));

    expect(pickAccent(cover)).toBe('#2878dc');
  });

  it('ignores transparent pixels', () => {
    expect(pickAccent(pixels(...repeat(20, [220, 40, 40, 0]), ...repeat(2, [40, 220, 40])))).toBe('#28dc28');
  });

  it('prefers the colour that covers most of the cover', () => {
    expect(pickAccent(pixels(...repeat(8, [40, 220, 40]), ...repeat(3, [220, 40, 40])))).toBe('#28dc28');
  });

  it('has no colour for a grey cover or none at all', () => {
    expect(pickAccent(pixels(...repeat(10, [120, 120, 120])))).toBeUndefined();
    expect(pickAccent(pixels())).toBeUndefined();
  });
});
