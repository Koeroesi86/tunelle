/** The head start of the next track in seconds until a start has been measured */
export const defaultLead = 0.1;
const minLead = 0.01;
const maxLead = 0.5;
const keptSamples = 5;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * How long the next element takes from the call to play until it plays, as the last starts measured. The next track starts that long before the
 * current one ends, so it sounds when the current one is done; a crossfade only changes this lead
 */
export const createLeadMeter = () => {
  const samples: number[] = [];

  return {
    record: (seconds: number) => {
      if (!Number.isFinite(seconds) || seconds < 0) return;

      samples.push(seconds);
      if (samples.length > keptSamples) samples.shift();
    },
    lead: () => (samples.length ? Math.min(maxLead, Math.max(minLead, median(samples))) : defaultLead),
  };
};

/** The wait in ms until the next track has to start, undefined for a stream or a track whose length is not known */
export const msUntilHandoff = (duration: number, currentTime: number, lead: number) =>
  Number.isFinite(duration) && duration > 0 ? Math.max(0, (duration - currentTime - lead) * 1000) : undefined;

/** A station that plays more seconds behind its newest audio than this is behind the live stream */
const maxLiveLag = 8;
/** Where a station that fell behind continues: this many seconds before the newest audio it holds */
const liveMargin = 1;

/** The time a station seeks to when it plays far behind the newest audio that it holds, undefined while it is close enough */
export const liveEdgeTarget = (bufferedEnd: number | undefined, currentTime: number) =>
  bufferedEnd !== undefined && bufferedEnd - currentTime > maxLiveLag ? bufferedEnd - liveMargin : undefined;
