import type { LoudnessAnalysis } from '@shared/types/loudness';
import { analysisVersion } from '@shared/constants/loudness';
import type { BlockStats } from './block-energies';
import { measurementRate } from './k-weighting';

/** The level a track is played at, the reference level of ReplayGain 2 */
export const targetLufs = -18;

const absoluteGate = -70;
const relativeGate = -10;
const rangeRelativeGate = -20;
const curvePoints = 256;
/** A short term value is the mean of the blocks of 3 s, taken every second */
const shortTermBlocks = 27;
const shortTermStep = 10;

/** The loudness of a mean square, in LUFS (the offset is the one of the K-weighting) */
const toLufs = (energy: number) => -0.691 + 10 * Math.log10(energy);

const mean = (values: ArrayLike<number>) => Array.from(values).reduce((sum, value) => sum + value, 0) / values.length;

/** The blocks above the absolute gate, then the ones above the relative gate below their own loudness */
const gate = (energies: number[], relative: number) => {
  const absolute = energies.filter((energy) => toLufs(energy) > absoluteGate);
  const threshold = absolute.length === 0 ? Infinity : toLufs(mean(absolute)) + relative;
  return absolute.filter((energy) => toLufs(energy) > threshold);
};

const percentile = (sorted: number[], fraction: number) => {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
};

/** The loudness range: the spread of the short term loudness between its 10th and its 95th percentile, after the gates (EBU Tech 3342) */
const loudnessRange = (energies: number[]) => {
  const shortTerm = Array.from({ length: Math.max(Math.floor((energies.length - shortTermBlocks) / shortTermStep) + 1, 0) }, (_, step) =>
    mean(energies.slice(step * shortTermStep, step * shortTermStep + shortTermBlocks))
  );
  const levels = gate(shortTerm, rangeRelativeGate)
    .map(toLufs)
    .sort((a, b) => a - b);
  return levels.length === 0 ? 0 : percentile(levels, 0.95) - percentile(levels, 0.1);
};

/** The loudness over the length of the track as a curve of a fixed size, in tenths of a dB */
const curveOf = (energies: number[]) => {
  const points = Math.min(curvePoints, energies.length);
  return Array.from({ length: points }, (_, point) =>
    Math.max(
      Math.round(toLufs(mean(energies.slice(Math.floor((point * energies.length) / points), Math.floor(((point + 1) * energies.length) / points)))) * 10),
      -1000
    )
  );
};

const histogramOf = (energies: number[]) => {
  const counts = new Map<string, number>();
  energies
    .map(toLufs)
    .filter((level) => level > absoluteGate)
    .forEach((level) => {
      const bin = String(Math.floor(level * 10));
      counts.set(bin, (counts.get(bin) ?? 0) + 1);
    });
  return Object.fromEntries(counts);
};

/**
 * The analysis of a track from the pieces it was decoded in, and the gain that levels it to the target.
 * Undefined for a track without a block above the absolute gate: silence has no loudness
 */
export const summarise = (parts: BlockStats[]) => {
  const energies = parts.flatMap((part) => Array.from(part.energies));
  const integrated = gate(energies, relativeGate);
  if (integrated.length === 0) return undefined;

  const integratedLufs = toLufs(mean(integrated));
  const analysis: LoudnessAnalysis = {
    v: analysisVersion,
    sampleRate: measurementRate,
    channels: parts[0]?.channels ?? 0,
    integratedLufs,
    loudnessRange: loudnessRange(energies),
    samplePeak: parts.reduce((peak, part) => Math.max(peak, part.peak), 0),
    shortTerm: curveOf(energies),
    histogram: { bin: 0.1, counts: histogramOf(energies) },
  };

  return { analysis, trackGain: targetLufs - integratedLufs, trackPeak: analysis.samplePeak };
};
