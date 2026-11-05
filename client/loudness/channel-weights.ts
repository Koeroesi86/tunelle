const surround = 1.41;

/**
 * The weight of each channel in the loudness of a file, by the order the decoder gives them: surround channels count 1.41, the LFE channel not at all.
 * An unknown layout counts every channel once
 */
export const channelWeights = (channels: number): number[] => {
  const layouts: Record<number, number[]> = {
    1: [1],
    2: [1, 1],
    // L R C
    3: [1, 1, 1],
    // L R Ls Rs
    4: [1, 1, surround, surround],
    // L R C Ls Rs
    5: [1, 1, 1, surround, surround],
    // L R C LFE Ls Rs
    6: [1, 1, 1, 0, surround, surround],
    // L R C LFE Lrs Rrs Ls Rs
    8: [1, 1, 1, 0, surround, surround, surround, surround],
  };

  return layouts[channels] ?? Array.from({ length: channels }, () => 1);
};
