import { describe, expect, it } from 'vitest';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import { toHistogramBars } from './histogram-bars';

const analysisOf = (counts: Record<string, number>, integratedLufs = -12): LoudnessAnalysis => ({
  v: 1,
  sampleRate: 48000,
  channels: 2,
  integratedLufs,
  loudnessRange: 5,
  samplePeak: 1,
  shortTerm: [],
  histogram: { bin: 0.1, counts },
});

describe('toHistogramBars', () => {
  it('adds the bins of 0.1 LU up into bars of 1 LU, from the first bar that has blocks to the last, the highest bar being 1', () => {
    // the bins -120 and -111 (-12.0 and -11.1 LUFS) are of the bar from -12 LUFS, -95 is of the bar from -10
    const result = toHistogramBars(analysisOf({ '-120': 4, '-111': 4, '-95': 2 }));

    expect(result).toMatchObject({ from: -12, to: -9, bars: [1, 0, 0.25] });
  });

  it('puts the marker where the integrated loudness is across the bars', () => {
    expect(toHistogramBars(analysisOf({ '-120': 1, '-100': 1 }, -11))?.marker).toBeCloseTo(1 / 3);
  });

  it('keeps the marker in the bars when the loudness is outside them', () => {
    expect(toHistogramBars(analysisOf({ '-120': 1 }, -40))?.marker).toBe(0);
  });

  it('has no bars for a histogram without blocks', () => {
    expect(toHistogramBars(analysisOf({}))).toBeUndefined();
  });
});
