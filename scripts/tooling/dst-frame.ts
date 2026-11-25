// The smallest DST encoder that gives arithmetic coded frames: a predictor of zero and even odds. See docs/app/decoder-proxy.md
const fullRange = 4095;
const codeBits = 12;
const evenOdds = 128;

const toBits = (value: number, width: number) => Array.from({ length: width }, (_, index) => (value >> (width - 1 - index)) & 1);

/** Coded frame, one segment for all channels, one filter and one probability table for all of them, no half probability */
const toHeader = (channels: number) => [
  ...[1, 1, 1, 1, 1, 1],
  ...Array.from({ length: channels }, () => 0),
  // the filter: one coefficient, uncoded, 0
  ...toBits(0, 7),
  0,
  ...toBits(0, 9),
  // the probability table: one entry, uncoded, stored one below its value
  ...toBits(0, 6),
  0,
  ...toBits(evenOdds - 1, 7),
  0,
];

/** Adds the carry of the arithmetic coder to the bits that are written already */
const carry = (bits: number[]) => {
  const zero = bits.lastIndexOf(0);
  bits.fill(0, zero + 1);
  bits[zero] = 1;
};

const createCoder = (bits: number[]) => {
  let range = fullRange;
  let low = 0;
  return {
    /** The mirror of `ac_get` of ffmpeg's `dstdec.c`: a 1 takes the lower part of the range */
    write: (bit: number, probability: number) => {
      const split = ((range >> 8) | ((range >> 7) & 1)) * probability;
      low += bit ? 0 : range - split;
      range = bit ? range - split : split;
      if (low > fullRange) carry(bits);
      low &= fullRange;
      for (; range < 2048; range <<= 1) {
        bits.push(low >> (codeBits - 1));
        low = (low << 1) & fullRange;
      }
    },
    end: () => bits.push(...toBits(low, codeBits)),
  };
};

const toByte = (bits: number[], index: number) =>
  Number.parseInt(
    bits
      .slice(index * 8, index * 8 + 8)
      .join('')
      .padEnd(8, '0'),
    2
  );

const toBytes = (bits: number[]) => Buffer.from(Array.from({ length: Math.ceil(bits.length / 8) }, (_, index) => toByte(bits, index)));

/** A DST frame of the DSD bytes of the channels, interleaved by byte, the most significant bit first */
export const encodeDstFrame = (dsd: Buffer, channels: number) => {
  const bits = toHeader(channels);
  const coder = createCoder(bits);
  // the bit before the samples, which the decoder reads and drops
  coder.write(1, 1);
  const samples = (dsd.length / channels) * 8;
  for (let sample = 0; sample < samples * channels; sample += 1) {
    const index = Math.floor(sample / channels);
    coder.write((dsd[(index >> 3) * channels + (sample % channels)] >> (7 - (index & 7))) & 1, evenOdds);
  }
  coder.end();
  return toBytes(bits);
};
