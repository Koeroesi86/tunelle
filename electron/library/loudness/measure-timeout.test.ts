import { describe, expect, it } from 'vitest';
import { measureTimeout } from './measure-timeout';

describe('measureTimeout', () => {
  it('is 5 minutes for a track of unknown length, and for a short one', () => {
    expect(measureTimeout(undefined)).toBe(300_000);
    expect(measureTimeout(0)).toBe(300_000);
  });

  it('is 10 s longer for each minute of the track, a started minute counted', () => {
    expect(measureTimeout(60)).toBe(310_000);
    expect(measureTimeout(61)).toBe(320_000);
    // 3 hours: 5 minutes and 30
    expect(measureTimeout(3 * 3600)).toBe(35 * 60_000);
  });

  it('is one hour at most', () => {
    expect(measureTimeout(24 * 3600)).toBe(3_600_000);
  });
});
