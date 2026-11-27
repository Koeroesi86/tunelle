/** The minimum requirement test signals of EBU Tech 3341 and 3342 (2023) that the app can answer. See docs/app/loudness-reference-cases.md */
import { describe, expect, it } from 'vitest';
import { toLufs } from '@shared/utils/to-lufs';
import { createBlockMeter } from './block-energies';
import { measurementRate } from './k-weighting';
import { summarise } from './summarise';

/** A stretch of the 1 kHz tone: how long it lasts and the peak level of each channel in dBFS */
interface Tone {
  seconds: number;
  levels: number[];
}

const stereo = (seconds: number, level: number): Tone => ({ seconds, levels: [level, level] });

const samplesOf = (level: number, start: number, length: number) => {
  const amplitude = 10 ** (level / 20);
  return Float32Array.from({ length }, (_, index) => amplitude * Math.sin((2 * Math.PI * 1000 * (start + index)) / measurementRate));
};

/** The blocks of the tones one after the other, the phase going on from one to the next */
const measure = (tones: Tone[]) => {
  const meter = createBlockMeter(tones[0].levels.length);
  tones.reduce((start, { seconds, levels }) => {
    const length = Math.round(seconds * measurementRate);
    meter.push(levels.map((level) => samplesOf(level, start, length)));
    return start + length;
  }, 0);
  return meter.finish();
};

const loudnessOf = (tones: Tone[]) => summarise([measure(tones)])?.analysis;

const expectWithin = (value: number | undefined, expected: number, tolerance: number) => {
  expect(value).toBeGreaterThanOrEqual(expected - tolerance);
  expect(value).toBeLessThanOrEqual(expected + tolerance);
};

describe('EBU Tech 3341', () => {
  it.each([
    [1, -23],
    [2, -33],
  ])('case %i: a stereo tone at %i dBFS has that momentary and integrated loudness', (_, level) => {
    const stats = measure([stereo(20, level)]);

    expectWithin(summarise([stats])?.analysis.integratedLufs, level, 0.1);
    stats.energies.forEach((energy) => expectWithin(toLufs(energy), level, 0.1));
  });

  it.each([
    [3, [stereo(10, -36), stereo(60, -23), stereo(10, -36)]],
    [4, [stereo(10, -72), stereo(10, -36), stereo(60, -23), stereo(10, -36), stereo(10, -72)]],
    [5, [stereo(20, -26), stereo(20.1, -20), stereo(20, -26)]],
    // L R C Ls Rs
    [6, [{ seconds: 20, levels: [-28, -28, -24, -30, -30] }]],
  ])('case %i: the integrated loudness is -23 LUFS', (_, tones) => {
    expectWithin(loudnessOf(tones)?.integratedLufs, -23, 0.1);
  });

  it('case 12: the momentary loudness of a tone that changes level with a period of 400 ms stays at -23 LUFS after 1 s', () => {
    const { energies } = measure(Array.from({ length: 25 }, () => [stereo(0.18, -20), stereo(0.22, -30)]).flat());

    // the blocks start every 100 ms, so the tenth starts 1 s in
    energies.slice(10).forEach((energy) => expectWithin(toLufs(energy), -23, 0.1));
  });
});

describe('EBU Tech 3342', () => {
  it.each([
    [1, 10, [-20, -30]],
    [2, 5, [-20, -15]],
    [3, 20, [-40, -20]],
    [4, 15, [-50, -35, -20, -35, -50]],
  ])('case %i: the loudness range is %i LU', (_, range, levels) => {
    expectWithin(loudnessOf(levels.map((level) => stereo(20, level)))?.loudnessRange, range, 1);
  });
});
