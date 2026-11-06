import { createKWeighting, measurementRate } from './k-weighting';
import { channelWeights } from './channel-weights';

/** A block is 400 ms long and starts every 100 ms (75 % overlap), the blocks of BS.1770: four hops */
const blockHop = Math.round(measurementRate * 0.1);
const hopsPerBlock = 4;

/** What the decoded pieces of a file give: the weighted mean square of each of its blocks and its highest sample. The parts of a long file are summed up together */
export interface BlockStats {
  energies: Float64Array;
  peak: number;
  channels: number;
}

const peakOf = (channels: Float32Array[]) => channels.reduce((peak, samples) => samples.reduce((high, value) => Math.max(high, Math.abs(value)), peak), 0);

interface ChannelState {
  weigh: ReturnType<typeof createKWeighting> | undefined;
  /** The sum of the squares of the weighted samples of the hop that is being filled, and how many samples it has */
  sum: number;
  filled: number;
  /** The sum of the squares of each hop that is complete */
  hops: number[];
}

const addSample = (state: ChannelState, value: number) => {
  const weighted = state.weigh?.(value) ?? 0;
  state.sum += weighted * weighted;
  state.filled += 1;
  if (state.filled < blockHop) return;
  state.hops.push(state.sum);
  state.sum = 0;
  state.filled = 0;
};

/**
 * Measures a file that comes in pieces, one after the other: the filters and the hop that is being filled go on from one piece to the next, so
 * the blocks are the ones of the whole file, whatever its pieces are. See docs/app/loudness-measurement.md
 */
export const createBlockMeter = (channelCount: number) => {
  const weights = channelWeights(channelCount);
  // a channel with no weight (the LFE) is not filtered, as nothing of it counts
  const states: ChannelState[] = weights.map((weight) => ({ weigh: weight === 0 ? undefined : createKWeighting(), sum: 0, filled: 0, hops: [] }));
  let peak = 0;

  return {
    /** The next samples of the file, a piece of each channel; a piece with another number of channels than the file is left out */
    push: (channels: Float32Array[]) => {
      if (channels.length !== channelCount) return false;
      peak = Math.max(peak, peakOf(channels));
      channels.forEach((samples, channel) => samples.forEach((value) => addSample(states[channel], value)));
      return true;
    },
    /** The weighted, K-weighted mean square of every block and the peak. A file shorter than a block has no block */
    finish: (): BlockStats => {
      const hops = states[0]?.hops.length ?? 0;
      const blockSize = hopsPerBlock * blockHop;
      const energies = Float64Array.from({ length: Math.max(hops - hopsPerBlock + 1, 0) }, (_, block) =>
        states.reduce((total, state, channel) => {
          const sum = state.hops.slice(block, block + hopsPerBlock).reduce((all, value) => all + value, 0);
          return total + (weights[channel] * sum) / blockSize;
        }, 0)
      );
      return { energies, peak, channels: channelCount };
    },
  };
};

/** The blocks of a file that is decoded as a whole */
export const measureBlocks = (channels: Float32Array[]): BlockStats => {
  const meter = createBlockMeter(channels.length);
  meter.push(channels);
  return meter.finish();
};
