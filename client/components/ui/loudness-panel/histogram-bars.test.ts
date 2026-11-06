import { describe, expect, it } from 'vitest';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import { toHistogramBars, toPlaybackMarker } from './histogram-bars';

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

describe('toPlaybackMarker', () => {
  const bars = { from: -12, to: -9 };
  // the curve is in tenths of a dB: -12.0, -10.5, -9.0
  const analysis = { ...analysisOf({ '-120': 1 }), shortTerm: [-120, -105, -90] };

  it.each([
    [0, 0],
    [0.34, 0.5],
    [0.5, 0.5],
    [0.99, 1],
  ])('puts the moment at %f of the track where the curve is there across the bars', (played, expected) => {
    expect(toPlaybackMarker(analysis, bars, played)).toBeCloseTo(expected);
  });

  it('takes the end of the curve for a position at or after the end, and the start for one before it', () => {
    expect(toPlaybackMarker(analysis, bars, 1)).toBe(1);
    expect(toPlaybackMarker(analysis, bars, 3)).toBe(1);
    expect(toPlaybackMarker(analysis, bars, -1)).toBe(0);
  });

  it('keeps the marker in the bars when the loudness of the moment is outside them', () => {
    expect(toPlaybackMarker({ ...analysis, shortTerm: [-400, 0] }, bars, 0)).toBe(0);
    expect(toPlaybackMarker({ ...analysis, shortTerm: [-400, 0] }, bars, 0.9)).toBe(1);
  });

  it('has no marker for a track without a curve, or a position that is not a number', () => {
    expect(toPlaybackMarker({ ...analysis, shortTerm: [] }, bars, 0.5)).toBeUndefined();
    expect(toPlaybackMarker(analysis, bars, Number.NaN)).toBeUndefined();
  });
});
