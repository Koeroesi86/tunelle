import type { LoudnessAnalysis } from '@shared/types/loudness';

/** The bins of the histogram are 0.1 LU, a bar of the view is 1 LU: ten bins */
const binsPerBar = 10;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * Where the loudness of the moment that plays is across the bars (0 to 1): the point of the curve of the track for the share of it that was played.
 * Undefined when the curve is empty or the share is not a number
 */
export const toPlaybackMarker = ({ shortTerm }: LoudnessAnalysis, { from, to }: { from: number; to: number }, played: number) => {
  const point = shortTerm[Math.min(Math.floor(clamp(played) * shortTerm.length), shortTerm.length - 1)];
  return point === undefined || Number.isNaN(played) ? undefined : clamp((point / 10 - from) / (to - from));
};

/**
 * The bars of the histogram of a track, from the quietest bar to the loudest one that has a block: each one's share of the highest bar (0 to 1), the
 * loudness the first bar starts at, and where the integrated loudness is in the bars (0 to 1 across them)
 */
export const toHistogramBars = ({ histogram, integratedLufs }: LoudnessAnalysis) => {
  const bins = Object.entries(histogram.counts).map(([bin, count]) => ({ bar: Math.floor(Number(bin) / binsPerBar), count }));
  if (bins.length === 0) return undefined;

  const first = Math.min(...bins.map(({ bar }) => bar));
  const last = Math.max(...bins.map(({ bar }) => bar));
  const totals = Array.from({ length: last - first + 1 }, (_, index) =>
    bins.filter(({ bar }) => bar === first + index).reduce((sum, { count }) => sum + count, 0)
  );
  const highest = Math.max(...totals);

  return {
    bars: totals.map((total) => total / highest),
    from: first,
    to: last + 1,
    marker: Math.min(Math.max((integratedLufs - first) / (last + 1 - first), 0), 1),
  };
};
