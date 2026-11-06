import { describe, expect, it } from 'vitest';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import { measureBlocks } from '../../client/loudness/block-energies';
import { measurementRate } from '../../client/loudness/k-weighting';
import { summarise } from '../../client/loudness/summarise';
import { poolAlbum } from './pool-loudness';

/** A stereo sine of 997 Hz, `seconds` long at the level in dBFS */
const tone = (db: number, seconds: number) => {
  const samples = Float32Array.from({ length: seconds * measurementRate }, (_, i) => 10 ** (db / 20) * Math.sin((2 * Math.PI * 997 * i) / measurementRate));
  return [samples, samples];
};

const analyse = (...parts: Float32Array[][]) => summarise(parts.map(measureBlocks));

const analysisOf = (db: number, seconds: number): LoudnessAnalysis => {
  const summary = analyse(tone(db, seconds));
  if (!summary) throw new Error('A tone has a loudness');
  return summary.analysis;
};

describe('poolAlbum', () => {
  it('gives the gain of a single track as the gain of the track, within the width of a bin', () => {
    const summary = analyse(tone(-20, 10));

    expect(poolAlbum([analysisOf(-20, 10)])?.albumGain).toBeCloseTo(summary?.trackGain ?? 0, 1);
  });

  it('gates the blocks of all the tracks together, like the blocks of one long track, and not as the average of their gains', () => {
    const loud = tone(-14, 5);
    const quiet = tone(-26, 5);
    const asOneTrack = analyse(loud, quiet);
    const loudAnalysis = analysisOf(-14, 5);
    const quietAnalysis = analysisOf(-26, 5);
    const pooled = poolAlbum([loudAnalysis, quietAnalysis]);

    expect(pooled?.albumGain).toBeCloseTo(asOneTrack?.trackGain ?? 0, 0);
    // the energy of the loud track weighs more, so the album is not at the average of the two gains
    expect(Math.abs((pooled?.albumGain ?? 0) - ((loudAnalysis.integratedLufs + quietAnalysis.integratedLufs) / -2 - 18))).toBeGreaterThan(1);
  });

  it('keeps the highest peak of the tracks', () => {
    const tracks = [
      { ...analysisOf(-20, 5), samplePeak: 0.4 },
      { ...analysisOf(-20, 5), samplePeak: 1.3 },
    ];

    expect(poolAlbum(tracks)?.albumPeak).toBe(1.3);
  });

  it('has no gain for no analyses and for analyses without a block', () => {
    expect(poolAlbum([])).toBeUndefined();
    expect(poolAlbum([{ ...analysisOf(-20, 5), histogram: { bin: 0.1, counts: {} } }])).toBeUndefined();
  });
});
