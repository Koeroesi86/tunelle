import { describe, expect, it } from 'vitest';
import { createBlockMeter, measureBlocks } from './block-energies';
import { measurementRate } from './k-weighting';

const noise = (seconds: number, seed: number) => {
  let state = seed;
  return Float32Array.from({ length: Math.round(seconds * measurementRate) }, () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return (state / 4294967296 - 0.5) * 0.5;
  });
};

/** The pieces a file is cut into, at the given sample counts: none of them a whole number of hops */
const cutAt = (channels: Float32Array[], points: number[]) =>
  [0, ...points, channels[0].length].slice(0, -1).map((start, index, starts) => {
    const end = [...starts.slice(1), channels[0].length][index];
    return channels.map((samples) => samples.subarray(start, end));
  });

describe('createBlockMeter', () => {
  const left = noise(5, 1);
  const right = noise(5, 2);
  const whole = measureBlocks([left, right]);

  it('gives the blocks of the whole file for a file that comes in pieces cut anywhere', () => {
    const meter = createBlockMeter(2);
    cutAt([left, right], [1234, 70_001, 150_000, 150_001]).forEach((piece) => meter.push(piece));
    const pieced = meter.finish();

    expect(pieced.energies.length).toBe(whole.energies.length);
    pieced.energies.forEach((energy, block) => expect(energy).toBeCloseTo(whole.energies[block], 12));
    expect(pieced.peak).toBe(whole.peak);
  });

  it('has no block for a file shorter than 400 ms', () => {
    expect(measureBlocks([noise(0.3, 3)]).energies).toHaveLength(0);
  });

  it('leaves out a piece with another number of channels', () => {
    const meter = createBlockMeter(2);

    expect(meter.push([left])).toBe(false);
    expect(meter.finish().energies).toHaveLength(0);
  });
});
