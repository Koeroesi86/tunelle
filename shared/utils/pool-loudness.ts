import type { LoudnessAnalysis } from '@shared/types/loudness';
import { targetLufs } from '../constants/loudness';
import { toLufs } from './to-lufs';

const relativeGate = -10;

/** The mean square of a loudness */
const toEnergy = (lufs: number) => 10 ** ((lufs + 0.691) / 10);

/**
 * The gain and the peak of an album from the analyses of its tracks: the blocks of all the histograms are gated together again (10 LU below their
 * loudness), as the blocks of one long track are, which is not the average of the gains of the tracks. A block counts as the middle of its bin, so
 * the loudness is off by at most 0.05 dB. Undefined when no block is above the gate
 */
export const poolAlbum = (analyses: LoudnessAnalysis[]) => {
  const width = analyses[0]?.histogram.bin ?? 0.1;
  const blocks = new Map<number, number>();
  analyses
    .flatMap((analysis) => Object.entries(analysis.histogram.counts))
    .forEach(([bin, count]) => blocks.set(Number(bin), (blocks.get(Number(bin)) ?? 0) + count));

  const levels = [...blocks].map(([bin, count]) => ({ lufs: (bin + 0.5) * width, count }));
  const meanOf = (selected: typeof levels) =>
    selected.reduce((sum, { lufs, count }) => sum + toEnergy(lufs) * count, 0) / selected.reduce((sum, { count }) => sum + count, 0);
  if (levels.length === 0) return undefined;

  const threshold = toLufs(meanOf(levels)) + relativeGate;
  const gated = levels.filter(({ lufs }) => lufs > threshold);
  if (gated.length === 0) return undefined;

  return {
    albumGain: targetLufs - toLufs(meanOf(gated)),
    albumPeak: analyses.reduce((peak, analysis) => Math.max(peak, analysis.samplePeak), 0),
  };
};
