import { describe, expect, it } from 'vitest';
import { getBandValues } from './getBandValues';

describe('getBandValues', () => {
  it('gives the high frequencies as many bins per band as the low ones, not the same share of the bars', () => {
    const data = new Uint8Array(1024);
    data[900] = 200;

    const bands = getBandValues(data, 45);

    expect(bands).toHaveLength(45);
    expect(bands.filter((value) => value === 200)).toHaveLength(1);
    expect(bands.findIndex((value) => value === 200)).toBeGreaterThan(40);
  });

  it('keeps the bass in the first bands', () => {
    const data = new Uint8Array(1024);
    data[1] = 255;

    expect(getBandValues(data, 45)[0]).toBe(255);
  });
});
