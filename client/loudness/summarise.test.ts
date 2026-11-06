import { describe, expect, it } from 'vitest';
import { measureBlocks } from './block-energies';
import { measurementRate } from './k-weighting';
import { analysisVersion, targetLufs } from '@shared/constants/loudness';
import { summarise } from './summarise';

const dbToAmplitude = (db: number) => 10 ** (db / 20);

/** A sine of 997 Hz, the frequency of the calibration of BS.1770, `seconds` long at the given level in dBFS */
const sine = (db: number, seconds: number) =>
  Float32Array.from({ length: seconds * measurementRate }, (_, i) => dbToAmplitude(db) * Math.sin((2 * Math.PI * 997 * i) / measurementRate));

const silence = (seconds: number) => new Float32Array(seconds * measurementRate);

const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((offset, part) => {
    out.set(part, offset);
    return offset + part.length;
  }, 0);
  return out;
};

const analyse = (...channels: Float32Array[]) => summarise([measureBlocks(channels)]);

describe('summarise', () => {
  it('reads a stereo sine of -20 dBFS as -20 LUFS, the calibration of BS.1770', () => {
    const tone = sine(-20, 10);
    const result = analyse(tone, tone);

    expect(result?.analysis.integratedLufs).toBeCloseTo(-20, 1);
    expect(result?.trackGain).toBeCloseTo(targetLufs + 20, 1);
    expect(result?.trackPeak).toBeCloseTo(dbToAmplitude(-20), 3);
  });

  it('reads a mono sine 3 dB lower than the same sine in both channels', () => {
    const tone = sine(-20, 10);

    expect(analyse(tone, tone)?.analysis.integratedLufs).toBeCloseTo((analyse(tone)?.analysis.integratedLufs ?? 0) + 3.01, 1);
  });

  it('has no loudness for silence', () => {
    expect(analyse(silence(5), silence(5))).toBeUndefined();
  });

  it('has no loudness for a piece shorter than a block', () => {
    expect(analyse(sine(-20, 0.2))).toBeUndefined();
  });

  it('gates out a quiet part: -90 dBFS after a tone does not lower the loudness', () => {
    const tone = sine(-20, 10);
    const quiet = join(tone, sine(-90, 10));

    // the blocks across the change are above the gate and count, so a small difference stays
    expect(analyse(quiet)?.analysis.integratedLufs).toBeCloseTo(analyse(tone)?.analysis.integratedLufs ?? 0, 0);
  });

  it('gates out a part 20 dB below the rest, which is under the relative gate', () => {
    const tone = sine(-20, 10);
    const mixed = join(tone, sine(-40, 10));

    expect(analyse(mixed)?.analysis.integratedLufs).toBeCloseTo(analyse(tone)?.analysis.integratedLufs ?? 0, 0);
  });

  it('weighs a surround channel 1.41 times and leaves out the LFE channel', () => {
    const tone = sine(-20, 4);
    const none = silence(4);
    const front = analyse(tone, none, none, none, none, none)?.analysis.integratedLufs ?? 0;
    const surround = analyse(none, none, none, none, tone, none)?.analysis.integratedLufs ?? 0;

    expect(surround - front).toBeCloseTo(10 * Math.log10(1.41), 1);
    expect(analyse(none, none, none, tone, none, none)).toBeUndefined();
  });

  it('measures a steady tone as a range of nearly nothing, and two levels 10 dB apart as about 10 LU', () => {
    expect(analyse(sine(-20, 20))?.analysis.loudnessRange).toBeLessThan(0.5);
    expect(analyse(join(sine(-20, 20), sine(-30, 20)))?.analysis.loudnessRange).toBeGreaterThan(8);
  });

  it('keeps the highest sample as the peak, also above full scale', () => {
    const loud = sine(-20, 5);
    loud[1000] = 1.5;

    expect(analyse(loud)?.trackPeak).toBeCloseTo(1.5, 5);
  });

  it('puts the blocks above the absolute gate in a histogram and gives a curve of at most 256 points', () => {
    const tone = sine(-20, 30);
    const { analysis } = analyse(tone, tone) ?? {};
    const blocks = Object.values(analysis?.histogram.counts ?? {}).reduce((sum, count) => sum + count, 0);

    expect(blocks).toBe(297);
    expect(analysis?.histogram.bin).toBe(0.1);
    expect(analysis?.shortTerm).toHaveLength(256);
    expect(analysis?.shortTerm.every((point) => Math.abs(point + 200) <= 3)).toBe(true);
    expect(analysis?.v).toBe(analysisVersion);
  });

  it('pools the pieces of a file decoded apart as one', () => {
    const tone = sine(-20, 20);
    const whole = analyse(tone, tone);
    const halves = summarise([measureBlocks([tone.slice(0, 480000), tone.slice(0, 480000)]), measureBlocks([tone.slice(480000), tone.slice(480000)])]);

    expect(halves?.analysis.integratedLufs).toBeCloseTo(whole?.analysis.integratedLufs ?? 0, 1);
    expect(halves?.trackPeak).toBeCloseTo(whole?.trackPeak ?? 0, 3);
  });
});
