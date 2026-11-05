import { createKWeighting, measurementRate } from './k-weighting';
import { channelWeights } from './channel-weights';

/** A block is 400 ms long and starts every 100 ms (75 % overlap), the blocks of BS.1770: four hops */
const blockHop = Math.round(measurementRate * 0.1);
const hopsPerBlock = 4;

/** What one decoded piece of a file gives: the weighted mean square of each of its blocks and its highest sample. The pieces of a long file are summed up together */
export interface BlockStats {
  energies: Float64Array;
  peak: number;
  channels: number;
}

const peakOf = (channels: Float32Array[]) => channels.reduce((peak, samples) => samples.reduce((high, value) => Math.max(high, Math.abs(value)), peak), 0);

/** The sum of the squares of the K-weighted samples of a channel in each hop, which the blocks are made of */
const hopSums = (samples: Float32Array, hops: number) => {
  const sums = new Float64Array(hops);
  const weigh = createKWeighting();
  const total = hops * blockHop;
  for (let i = 0; i < total; i++) {
    const value = weigh(samples[i]);
    sums[Math.floor(i / blockHop)] += value * value;
  }
  return sums;
};

/** The weighted, K-weighted mean square of every block of the piece, and its peak. A piece shorter than a block has none */
export const measureBlocks = (channels: Float32Array[]): BlockStats => {
  const weights = channelWeights(channels.length);
  const hops = Math.floor((channels[0]?.length ?? 0) / blockHop);
  const energies = new Float64Array(Math.max(hops - hopsPerBlock + 1, 0));
  const blockSize = hopsPerBlock * blockHop;

  channels.forEach((samples, channel) => {
    if (weights[channel] === 0 || energies.length === 0) return;
    const sums = hopSums(samples, hops);
    energies.forEach((_, block) => {
      energies[block] += (weights[channel] * sums.subarray(block, block + hopsPerBlock).reduce((sum, value) => sum + value, 0)) / blockSize;
    });
  });

  return { energies, peak: peakOf(channels), channels: channels.length };
};
