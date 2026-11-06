/** The loudness of a mean square, in LUFS (the offset is the one of the K-weighting of BS.1770) */
export const toLufs = (energy: number) => -0.691 + 10 * Math.log10(energy);
