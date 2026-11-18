import type { NowPlaying } from '../schemas/now-playing';

/** A listener that is further from the host than this seeks; smaller steps are left to the audio clock */
export const DRIFT_SECONDS = 0.5;

/** Where the host is now, from its snapshot: a playing track runs on from the time of the snapshot */
export const expectedPosition = (snapshot: NowPlaying): number | undefined => {
  if (snapshot.state === 'idle') return undefined;
  if (snapshot.state === 'paused') return snapshot.position;
  return snapshot.position + Math.max(0, Date.now() - snapshot.at) / 1000;
};

/** The position to seek to, or `undefined` when the listener is close enough */
export const driftCorrection = (snapshot: NowPlaying, localPosition: number): number | undefined => {
  const expected = expectedPosition(snapshot);
  if (expected === undefined) return undefined;
  return Math.abs(expected - localPosition) > DRIFT_SECONDS ? expected : undefined;
};
