export interface WavLayout {
  channels: number;
  sampleRate: number;
  bytesPerSample: number;
  frames: number;
  /** IEEE float samples, integer PCM otherwise */
  float?: boolean;
}

const riffHeaderSize = 44;
/** RF64 has the 36 bytes of its `ds64` chunk more */
const rf64HeaderSize = riffHeaderSize + 36;
/** The largest size of 32 bit, which RF64 writes where the real one is in `ds64` */
const inDs64 = 0xffffffff;

/** The size of the samples */
export const wavDataSize = ({ channels, bytesPerSample, frames }: WavLayout) => frames * channels * bytesPerSample;

/** The sizes of a RIFF file are 32 bit, a larger one is RF64 */
const isLarge = (layout: WavLayout) => riffHeaderSize - 8 + wavDataSize(layout) > inDs64;

export const wavHeaderSize = (layout: WavLayout) => (isLarge(layout) ? rf64HeaderSize : riffHeaderSize);

/** The size of the whole WAV file for a layout: the header and the samples */
export const wavSize = (layout: WavLayout) => wavHeaderSize(layout) + wavDataSize(layout);

/** The id and the size of a chunk, and its body */
const chunk = (id: string, size: number, body = Buffer.alloc(0)) => {
  const start = Buffer.alloc(8);
  start.write(id, 0, 'ascii');
  start.writeUInt32LE(size, 4);
  return Buffer.concat([start, body]);
};

const formatChunk = (layout: WavLayout) => {
  const { channels, sampleRate, bytesPerSample } = layout;
  const body = Buffer.alloc(16);
  body.writeUInt16LE(layout.float ? 3 : 1, 0);
  body.writeUInt16LE(channels, 2);
  body.writeUInt32LE(sampleRate, 4);
  body.writeUInt32LE(sampleRate * channels * bytesPerSample, 8);
  body.writeUInt16LE(channels * bytesPerSample, 12);
  body.writeUInt16LE(bytesPerSample * 8, 14);
  return chunk('fmt ', body.length, body);
};

/** The 64 bit sizes of the file, of the samples and of the frames, and an empty table */
const sizesChunk = (layout: WavLayout) => {
  const body = Buffer.alloc(28);
  body.writeBigUInt64LE(BigInt(wavSize(layout) - 8), 0);
  body.writeBigUInt64LE(BigInt(wavDataSize(layout)), 8);
  body.writeBigUInt64LE(BigInt(layout.frames), 16);
  return chunk('ds64', body.length, body);
};

/** The header of a PCM or float WAV file that holds `frames` frames (RF64 above 4 GiB), so the size is known before the samples are decoded. See docs/app/decoder-proxy.md */
export const wavHeader = (layout: WavLayout) => {
  const large = isLarge(layout);
  return Buffer.concat([
    chunk(large ? 'RF64' : 'RIFF', large ? inDs64 : wavSize(layout) - 8, Buffer.from('WAVE')),
    ...(large ? [sizesChunk(layout)] : []),
    formatChunk(layout),
    chunk('data', large ? inDs64 : wavDataSize(layout)),
  ]);
};
