import fs from 'fs';

/** What the integration tests read of a WAV file that the decoder wrote. */
/** The level of a sine of the frequency in the samples (Goertzel), as a share of the level of all of them */
export const toneShare = (samples: Float64Array, frequency: number, sampleRate: number) => {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  const [last, beforeLast] = samples.reduce(([previous, older], sample) => [sample + coefficient * previous - older, previous], [0, 0]);
  const power = last ** 2 + beforeLast ** 2 - coefficient * last * beforeLast;
  const energy = samples.reduce((sum, sample) => sum + sample ** 2, 0);
  return (2 * power) / (samples.length * energy);
};

export const readWav = (file: string) => {
  const data = fs.readFileSync(file);
  const chunks = (offset: number): { name: string; start: number; size: number }[] =>
    offset + 8 > data.length
      ? []
      : [
          { name: data.toString('ascii', offset, offset + 4), start: offset + 8, size: data.readUInt32LE(offset + 4) },
          ...chunks(offset + 8 + data.readUInt32LE(offset + 4) + (data.readUInt32LE(offset + 4) % 2)),
        ];
  const found = chunks(12);
  const format = found.find(({ name }) => name === 'fmt ');
  const body = found.find(({ name }) => name === 'data');
  if (!format || !body || data.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${file} is not a WAV file`);
  const channels = data.readUInt16LE(format.start + 2);
  const sampleRate = data.readUInt32LE(format.start + 4);
  const bytes = data.readUInt16LE(format.start + 14) / 8;
  const size = Math.min(body.size, data.length - body.start);
  const frames = Math.floor(size / (bytes * channels));
  // a sample is a signed little endian integer of 2, 3 or 4 bytes
  const channelData = Array.from({ length: channels }, (_, channel) =>
    Float64Array.from({ length: frames }, (_, frame) => data.readIntLE(body.start + (frame * channels + channel) * bytes, bytes) / 2 ** (bytes * 8 - 1))
  );
  return { channels, sampleRate, bytes, seconds: frames / sampleRate, samples: channelData[0], channelData };
};

/** The samples at another rate, by cubic interpolation: close enough to the resampling of Chromium for the level of a sine to agree within a few hundredths of a LU. */
export const resample = (samples: Float64Array, from: number, to: number) =>
  Float32Array.from({ length: Math.floor((samples.length * to) / from) }, (_, index) => {
    const position = (index * from) / to;
    const base = Math.floor(position);
    const t = position - base;
    const [a, b, c, d] = [-1, 0, 1, 2].map((offset) => samples[Math.min(Math.max(base + offset, 0), samples.length - 1)]);

    return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  });
