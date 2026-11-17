import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIFT_SECONDS, driftCorrection, expectedPosition } from './remote-position';

describe('the position of the host', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
  });

  afterEach(() => vi.useRealTimers());

  it('runs on from the time of the snapshot while the host plays', () => {
    expect(expectedPosition({ state: 'playing', title: 'Song', position: 30, at: 4_000 })).toBe(36);
  });

  it('stays where it is while the host is paused, and is unknown when it is idle', () => {
    expect(expectedPosition({ state: 'paused', title: 'Song', position: 30, at: 1_000 })).toBe(30);
    expect(expectedPosition({ state: 'idle' })).toBeUndefined();
  });

  it('does not run backwards when the clock of the host is ahead', () => {
    expect(expectedPosition({ state: 'playing', title: 'Song', position: 30, at: 12_000 })).toBe(30);
  });
});

describe('the drift of the listener', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
  });

  afterEach(() => vi.useRealTimers());

  const playing = { state: 'playing', title: 'Song', position: 30, at: 10_000 } as const;

  it('leaves a listener that is close enough alone', () => {
    expect(driftCorrection(playing, 30 + DRIFT_SECONDS)).toBeUndefined();
    expect(driftCorrection(playing, 30 - DRIFT_SECONDS)).toBeUndefined();
  });

  it('seeks to where the host is when the listener is further away, ahead or behind', () => {
    expect(driftCorrection(playing, 31)).toBe(30);
    expect(driftCorrection(playing, 20)).toBe(30);
  });

  it('seeks to the host position of a paused host, and does nothing when it is idle', () => {
    expect(driftCorrection({ state: 'paused', title: 'Song', position: 5, at: 0 }, 50)).toBe(5);
    expect(driftCorrection({ state: 'idle' }, 50)).toBeUndefined();
  });
});
