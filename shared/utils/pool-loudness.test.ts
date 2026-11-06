import { describe, expect, it } from 'vitest';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import { targetLufs } from '../constants/loudness';
import { poolAlbum } from './pool-loudness';

const energyOf = (lufs: number) => 10 ** ((lufs + 0.691) / 10);
const lufsOf = (energy: number) => -0.691 + 10 * Math.log10(energy);

/** The analysis of a track as its histogram: how many blocks it has in each bin of 0.1 LU, keyed by the bin (`-200` is -20.0 to -19.9, which counts as -19.95) */
const analysis = (counts: Record<string, number>, samplePeak = 0.5): LoudnessAnalysis => ({
  v: 1,
  sampleRate: 48000,
  channels: 2,
  integratedLufs: 0,
  loudnessRange: 0,
  samplePeak,
  shortTerm: [],
  histogram: { bin: 0.1, counts },
});

describe('poolAlbum', () => {
  it('gives the gain of a single track from the middle of the bin of its blocks', () => {
    expect(poolAlbum([analysis({ '-200': 100 })])?.albumGain).toBeCloseTo(targetLufs + 19.95, 6);
  });

  it('adds the blocks of the same bin of the tracks', () => {
    const pooled = poolAlbum([analysis({ '-200': 10 }), analysis({ '-200': 30 })]);

    expect(pooled?.albumGain).toBeCloseTo(targetLufs + 19.95, 6);
  });

  it('takes the mean of the energy of the blocks of all the tracks, which is not the average of their loudness', () => {
    const pooled = poolAlbum([analysis({ '-140': 50 }), analysis({ '-260': 50 })]);
    const mean = lufsOf((energyOf(-13.95) + energyOf(-25.95)) / 2);

    expect(pooled?.albumGain).toBeCloseTo(targetLufs - mean, 6);
    expect(Math.abs((pooled?.albumGain ?? 0) - (targetLufs - (-13.95 + -25.95) / 2))).toBeGreaterThan(1);
  });

  it('gates out the blocks 10 LU below the loudness of all of them, and keeps the ones above', () => {
    expect(poolAlbum([analysis({ '-200': 100 }), analysis({ '-400': 100 })])?.albumGain).toBeCloseTo(targetLufs + 19.95, 6);
    expect(poolAlbum([analysis({ '-200': 100 }), analysis({ '-260': 100 })])?.albumGain).toBeGreaterThan(targetLufs + 19.95 + 1);
  });

  it('keeps the highest peak of the tracks', () => {
    const pooled = poolAlbum([analysis({ '-200': 5 }, 0.4), analysis({ '-200': 5 }, 1.3), analysis({ '-200': 5 }, 0.9)]);

    expect(pooled?.albumPeak).toBe(1.3);
  });

  it.each([
    ['no analyses', []],
    ['analyses without a block', [analysis({}), analysis({})]],
  ])('has no gain for %s', (_, analyses) => {
    expect(poolAlbum(analyses)).toBeUndefined();
  });
});
