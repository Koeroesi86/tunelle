// What the soak run makes of the numbers it took over time. See docs/development/soak-run.md

/** The numbers of one checkpoint, by their name */
export type Sample = Record<string, number>;

/** The changes of track of one recording, in seconds */
export interface Joins {
  silence: number;
  overlaps: number[];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
};

/** How much a series rose: the median of its last third over the median of its first one, so one high or low reading does not count */
export const growthOf = (series: number[]) => {
  if (series.length < 3) throw new Error(`A growth needs at least 3 readings, not ${series.length}`);
  const third = Math.floor(series.length / 3);
  return median(series.slice(-third)) - median(series.slice(0, third));
};

const seriesOf = (samples: Sample[], name: string) =>
  samples.map((sample) => {
    if (sample[name] === undefined) throw new Error(`A sample has no ${name}`);
    return sample[name];
  });

/** A line for each number that rose by more than its limit */
export const leaksIn = (samples: Sample[], limits: Sample) =>
  Object.entries(limits)
    .map(([name, limit]) => ({ name, limit, series: seriesOf(samples, name) }))
    .filter(({ limit, series }) => growthOf(series) > limit)
    .map(({ name, limit, series }) => `${name} rose by ${growthOf(series)}, over ${limit}: ${series.join(', ')}`);

/** A silence of a millisecond or less is not heard as a gap */
const noGap = 0.001;
/** As in the gapless spec, for a change that follows others. See docs/development/gapless-measurement.md */
const longestOverlap = 0.06;
const mostDrift = 0.02;
// a loaded runner starves the audio thread now and then, which one recording of ten may show
const allowedShare = 0.1;

const outside = (name: string, values: number[], limit: number) => {
  const over = values.filter((value) => value > limit);
  if (over.length <= Math.floor(values.length * allowedShare)) return [];
  return [`${over.length} of ${values.length} ${name} over ${limit} s: ${over.join(', ')}`];
};

/** What is wrong with the changes of track over the run: too many gaps, too many long overlaps, or overlaps that grow */
export const joinFaults = (recordings: Joins[]) => {
  const drift = growthOf(recordings.map(({ overlaps }) => median(overlaps)));
  return [
    ...outside(
      'silences',
      recordings.map(({ silence }) => silence),
      noGap
    ),
    ...outside(
      'overlaps',
      recordings.flatMap(({ overlaps }) => overlaps),
      longestOverlap
    ),
    ...(drift > mostDrift ? [`the overlap grew by ${drift} s, over ${mostDrift} s`] : []),
  ];
};
