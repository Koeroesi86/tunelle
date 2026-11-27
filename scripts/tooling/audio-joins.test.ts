import { describe, expect, it } from 'vitest';
import { longestSilence, overlapOf } from './audio-joins';

const rate = 44100;
const seconds = 0.5;
/** Where the second tone follows the first, in samples */
const join = seconds * rate;

const toneAt = (frequency: number, index: number, level = 0.25) => level * Math.sin((2 * Math.PI * frequency * index) / rate);

/** A tone of 440 Hz and one of 880 Hz, the second starting `offsetMs` after the first ends: before it, and so over it, when negative */
const changeOfTrack = (offsetMs: number, secondLevel = 0.25) => {
  const start = join + Math.round((offsetMs / 1000) * rate);
  return Array.from(
    { length: start + join },
    (_, index) => (index < join ? toneAt(440, index) : 0) + (index >= start ? toneAt(880, index - start, secondLevel) : 0)
  );
};

describe('longestSilence', () => {
  it('finds none where one tone follows the other at once', () => {
    expect(longestSilence(changeOfTrack(0), rate)).toBeLessThan(0.0001);
  });

  it.each([2, 5, 15, 80])('measures a gap of %s ms, also one shorter than a window of the probe', (gap) => {
    expect(longestSilence(changeOfTrack(gap), rate)).toBeCloseTo(gap / 1000, 4);
  });

  it('leaves out the silence before the first sound and after the last one', () => {
    const silence = new Array<number>(rate).fill(0);

    expect(longestSilence([...silence, ...changeOfTrack(3), ...silence], rate)).toBeCloseTo(0.003, 4);
  });

  it('fails when nothing was heard', () => {
    expect(() => longestSilence(new Array<number>(100).fill(0), rate)).toThrow('Nothing was heard');
  });
});

describe('overlapOf', () => {
  const overlapMs = (samples: number[]) => overlapOf(samples, rate, [440, 880]) * 1000;

  it.each([3, 10, 40, 100])('measures two tones that sound at once for %s ms, within two milliseconds', (overlap) => {
    expect(Math.abs(overlapMs(changeOfTrack(-overlap)) - overlap)).toBeLessThanOrEqual(2);
  });

  it.each([0, 5])('finds none with a gap of %s ms', (gap) => {
    expect(overlapMs(changeOfTrack(gap))).toBeLessThanOrEqual(2);
  });

  it('measures tones of different levels by the level of each', () => {
    expect(Math.abs(overlapMs(changeOfTrack(-20, 0.1)) - 20)).toBeLessThanOrEqual(2);
  });

  it('fails when one of the tones was not heard, instead of measuring what the other leaves at its frequency', () => {
    expect(() => overlapOf(changeOfTrack(0), rate, [440, 1320])).toThrow('The tone of 1320 Hz was not heard');
  });
});
