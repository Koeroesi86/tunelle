/** A measurement has this long, and more for a long file, which is fetched and decoded in pieces for as long as it plays: 10 s for each minute of it */
const baseTimeout = 300_000;
const perMinute = 10_000;
/** No file has longer than this: a drive that does not answer must not hold the window for ever */
const maxTimeout = 3_600_000;

/** How long the measurement of a track of `duration` seconds may take before its window is closed. See docs/app/loudness-measurement.md */
export const measureTimeout = (duration: number | undefined) => Math.min(baseTimeout + Math.ceil((duration ?? 0) / 60) * perMinute, maxTimeout);
