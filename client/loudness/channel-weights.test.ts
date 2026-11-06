import { describe, expect, it } from 'vitest';
import { channelWeights } from './channel-weights';

describe('channelWeights', () => {
  it.each([
    [1, [1]],
    [2, [1, 1]],
    [4, [1, 1, 1.41, 1.41]],
    [5, [1, 1, 1, 1.41, 1.41]],
  ])('weighs the %i channels of a layout by its order', (channels, weights) => {
    expect(channelWeights(channels)).toEqual(weights);
  });

  it('leaves out the LFE channel of 5.1 and weighs its surround channels 1.41 times', () => {
    expect(channelWeights(6)).toEqual([1, 1, 1, 0, 1.41, 1.41]);
  });

  it('leaves out the LFE channel of 7.1', () => {
    expect(channelWeights(8)).toEqual([1, 1, 1, 0, 1.41, 1.41, 1.41, 1.41]);
  });

  it('counts every channel of an unknown layout once', () => {
    expect(channelWeights(7)).toEqual(new Array(7).fill(1));
  });
});
