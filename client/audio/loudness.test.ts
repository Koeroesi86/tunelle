import { describe, expect, it } from 'vitest';
import { normalizationGain } from './loudness';

const dB = (factor: number) => 20 * Math.log10(factor);

describe('normalizationGain', () => {
  const tags = { trackGain: -6, albumGain: -3, trackPeak: 0.5, albumPeak: 0.8 };

  it('is unity when it is off, whatever the tags say', () => {
    expect(normalizationGain(tags, 'off')).toBe(1);
  });

  it('is unity for a track without a gain, or no track at all', () => {
    expect(normalizationGain({ trackGain: null, albumGain: null }, 'album')).toBe(1);
    expect(normalizationGain({}, 'track')).toBe(1);
    expect(normalizationGain(undefined, 'track')).toBe(1);
  });

  it('uses the track gain in track mode and the album gain in album mode', () => {
    expect(dB(normalizationGain(tags, 'track'))).toBeCloseTo(-6);
    expect(dB(normalizationGain(tags, 'album'))).toBeCloseTo(-3);
  });

  it('falls back to the track gain in album mode when the album has none, with the peak of the track', () => {
    expect(dB(normalizationGain({ trackGain: 4, albumGain: null, trackPeak: 0.5, albumPeak: 0.9 }, 'album'))).toBeCloseTo(4);
    expect(dB(normalizationGain({ trackGain: 9, albumGain: null, trackPeak: 0.5, albumPeak: 0.9 }, 'album'))).toBeCloseTo(6.02, 1);
  });

  it('does not boost past the peak, so the loudest sample stays at full scale', () => {
    expect(normalizationGain({ trackGain: 12, trackPeak: 0.8 }, 'track')).toBeCloseTo(1.25);
  });

  it('does not boost without a peak, and still cuts', () => {
    expect(normalizationGain({ trackGain: 6 }, 'track')).toBe(1);
    expect(dB(normalizationGain({ trackGain: -6 }, 'track'))).toBeCloseTo(-6);
  });
});
