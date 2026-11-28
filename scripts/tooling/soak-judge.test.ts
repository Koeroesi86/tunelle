import { describe, expect, it } from 'vitest';
import { growthOf, joinFaults, leaksIn } from './soak-judge';

const recordings = (count: number, silence = 0, overlap = 0.02) => Array.from({ length: count }, () => ({ silence, overlaps: [overlap, overlap, overlap] }));

describe('growthOf', () => {
  it('is the median of the last third over the median of the first one', () => {
    expect(growthOf([10, 12, 11, 40, 40, 40, 20, 21, 90])).toBe(10);
  });

  it('is negative for a series that falls', () => {
    expect(growthOf([5, 4, 3])).toBe(-2);
  });

  it('takes the middle of a third of two readings', () => {
    expect(growthOf([1, 3, 0, 0, 10, 14])).toBe(10);
  });

  it('refuses fewer than three readings', () => {
    expect(() => growthOf([1, 2])).toThrow('at least 3 readings');
  });
});

describe('leaksIn', () => {
  const samples = [1, 2, 3].map((step) => ({ listeners: step * 30, files: 4 }));

  it('names what rose by more than its limit, with its readings', () => {
    expect(leaksIn(samples, { listeners: 50, files: 0 })).toEqual(['listeners rose by 60, over 50: 30, 60, 90']);
  });

  it('takes a rise of the limit itself', () => {
    expect(leaksIn(samples, { listeners: 60 })).toEqual([]);
  });

  it('refuses a limit that no reading is of', () => {
    expect(() => leaksIn(samples, { handles: 1 })).toThrow('no handles');
  });
});

describe('joinFaults', () => {
  it('finds nothing in short overlaps without silence', () => {
    expect(joinFaults(recordings(10))).toEqual([]);
  });

  it('takes one gap and a tenth of long overlaps, as a loaded system makes them', () => {
    const [first, ...rest] = recordings(10);
    expect(joinFaults([{ ...first, silence: 0.02, overlaps: [0.08, 0.08, 0.08] }, ...rest])).toEqual([]);
  });

  it('finds gaps in more than a tenth of the recordings', () => {
    expect(joinFaults([...recordings(8), ...recordings(2, 0.012)])).toEqual(['2 of 10 silences over 0.001 s: 0.012, 0.012']);
  });

  it('finds long overlaps, and that they grew', () => {
    expect(joinFaults([...recordings(7), ...recordings(3, 0, 0.1)])).toEqual([
      expect.stringContaining('9 of 30 overlaps over 0.06 s'),
      expect.stringContaining('the overlap grew by 0.08'),
    ]);
  });

  it('finds an overlap that grew under its limit', () => {
    expect(joinFaults([...recordings(3, 0, 0.01), ...recordings(3, 0, 0.05)])).toEqual([expect.stringContaining('the overlap grew by 0.04')]);
  });
});
