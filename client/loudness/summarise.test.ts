import { describe, expect, it } from 'vitest';
import type { BlockStats } from './block-energies';
import { measurementRate } from './k-weighting';
import { analysisVersion, targetLufs } from '@shared/constants/loudness';
import { summarise } from './summarise';

/** The blocks that a meter would have measured, made by hand: `count` blocks that are `lufs` loud (the inverse of the conversion of the meter) */
const blocks = (lufs: number, count: number) => new Float64Array(count).fill(10 ** ((lufs + 0.691) / 10));

const join = (...parts: Float64Array[]) => Float64Array.from(parts.flatMap((part) => Array.from(part)));

const stats = (energies: Float64Array, peak = 0.1, channels = 2): BlockStats => ({ energies, peak, channels });

describe('summarise', () => {
  it('gives the loudness of the blocks, and the gain that brings it to the target', () => {
    const result = summarise([stats(blocks(-20, 100), 0.1)]);

    expect(result?.analysis.integratedLufs).toBeCloseTo(-20, 6);
    expect(result?.trackGain).toBeCloseTo(targetLufs + 20, 6);
    expect(result?.trackPeak).toBe(0.1);
  });

  it('takes the number of channels and the rate of the measurement into the analysis', () => {
    const { analysis } = summarise([stats(blocks(-20, 10), 0.1, 6)]) ?? {};

    expect(analysis?.channels).toBe(6);
    expect(analysis?.sampleRate).toBe(measurementRate);
    expect(analysis?.v).toBe(analysisVersion);
  });

  it.each([
    ['no block at all', stats(new Float64Array(0))],
    ['blocks of silence', stats(new Float64Array(50))],
    ['blocks under the absolute gate of -70 LUFS', stats(blocks(-80, 50))],
  ])('has no loudness for %s', (_, part) => {
    expect(summarise([part])).toBeUndefined();
  });

  it('leaves out the blocks under the absolute gate: a quiet part does not lower the loudness', () => {
    const result = summarise([stats(join(blocks(-20, 100), blocks(-90, 100)))]);

    expect(result?.analysis.integratedLufs).toBeCloseTo(-20, 6);
  });

  it('gates out a part 20 dB below the rest, which is under the relative gate of 10 LU', () => {
    const result = summarise([stats(join(blocks(-20, 100), blocks(-40, 100)))]);

    expect(result?.analysis.integratedLufs).toBeCloseTo(-20, 6);
  });

  it('keeps a part 5 dB below the rest, which is over the relative gate, in the mean of the energies', () => {
    const result = summarise([stats(join(blocks(-20, 100), blocks(-25, 100)))]);
    const energy = (lufs: number) => 10 ** ((lufs + 0.691) / 10);

    expect(result?.analysis.integratedLufs).toBeCloseTo(-0.691 + 10 * Math.log10((energy(-20) + energy(-25)) / 2), 6);
  });

  it('measures a steady level as a range of nothing, and two levels 10 dB apart as 10 LU', () => {
    expect(summarise([stats(blocks(-20, 300))])?.analysis.loudnessRange).toBeCloseTo(0, 6);
    expect(summarise([stats(join(blocks(-20, 300), blocks(-30, 300)))])?.analysis.loudnessRange).toBeGreaterThan(8);
  });

  it('keeps the highest peak of the pieces', () => {
    const result = summarise([stats(blocks(-20, 50), 0.3), stats(blocks(-20, 50), 1.5), stats(blocks(-20, 50), 0.9)]);

    expect(result?.trackPeak).toBe(1.5);
  });

  it('puts the blocks above the absolute gate in a histogram and gives a curve of at most 256 points', () => {
    const { analysis } = summarise([stats(join(blocks(-20, 297), blocks(-90, 20)))]) ?? {};
    const counted = Object.values(analysis?.histogram.counts ?? {}).reduce((sum, count) => sum + count, 0);

    expect(counted).toBe(297);
    expect(analysis?.histogram.bin).toBe(0.1);
    expect(analysis?.shortTerm).toHaveLength(256);
    expect(analysis?.shortTerm.slice(0, 200).every((point) => point === -200)).toBe(true);
  });

  it('gives a curve with a point for each block of a short track', () => {
    expect(summarise([stats(blocks(-20, 12))])?.analysis.shortTerm).toEqual(new Array(12).fill(-200));
  });

  it('pools the pieces of a file decoded apart as one', () => {
    const quiet = blocks(-30, 150);
    const loud = blocks(-20, 150);
    const whole = summarise([stats(join(quiet, loud), 0.5)]);
    const pieces = summarise([stats(quiet, 0.2), stats(loud, 0.5)]);

    expect(pieces?.analysis).toEqual(whole?.analysis);
    expect(pieces?.trackPeak).toBe(whole?.trackPeak);
  });
});
