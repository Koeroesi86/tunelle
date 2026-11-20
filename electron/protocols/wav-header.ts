export interface WavLayout {
  channels: number;
  sampleRate: number;
  bytesPerSample: number;
  frames: number;
}

export const wavHeaderSize = 44;

/** The size of the whole WAV file for a layout: the header and the samples */
export const wavSize = ({ channels, bytesPerSample, frames }: WavLayout) => wavHeaderSize + frames * channels * bytesPerSample;

/** The 44 byte header of a PCM WAV file that holds `frames` frames, so the size is known before the samples are decoded. See docs/app/decoder-proxy.md */
export const wavHeader = (layout: WavLayout) => {
  const { channels, sampleRate, bytesPerSample } = layout;
  const header = Buffer.alloc(wavHeaderSize);
  const dataSize = wavSize(layout) - wavHeaderSize;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(wavSize(layout) - 8, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return header;
};
