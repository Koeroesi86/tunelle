import { createHash } from 'crypto';

// The files of e2e/fixtures/noise and the PCM they were made from: noise, so every bit and channel counts. See e2e/fixtures/README.md
export const noiseFrames = 6000;

export interface NoiseFixture {
  file: string;
  /** What the scan says of the file */
  codec: string;
  channels: number;
  bits: 16 | 24;
  sampleRate: number;
  /** The tool that writes the file, and for ffmpeg its output arguments */
  tool: 'ffmpeg' | 'wavpack';
  args: string[];
}

interface Form {
  name: string;
  extension: string;
  codec: string;
  tool?: 'wavpack';
  args: (bits: 16 | 24) => string[];
}

/** FLAC and ALAC take 24 bit in samples of 32 bit */
const sampleFormat = (bits: 16 | 24, planar = '') => ['-sample_fmt', `${bits === 24 ? 's32' : 's16'}${planar}`];
const pcm = (bits: 16 | 24, order: 'le' | 'be') => ['-c:a', `pcm_s${bits}${order}`];
const flac = (bits: 16 | 24) => ['-c:a', 'flac', ...sampleFormat(bits)];
const alac = (bits: 16 | 24) => ['-c:a', 'alac', ...sampleFormat(bits, 'p')];
const wav = (bits: 16 | 24) => pcm(bits, 'le');

const forms = {
  flac: { name: 'flac', extension: 'flac', codec: 'FLAC', args: flac },
  mka: { name: 'mka', extension: 'mka', codec: 'FLAC', args: flac },
  alac: { name: 'alac', extension: 'm4a', codec: 'ALAC', args: alac },
  cafAlac: { name: 'caf-alac', extension: 'caf', codec: 'ALAC', args: alac },
  wavpack: { name: 'wavpack', extension: 'wv', codec: 'WAVPACK', tool: 'wavpack', args: () => ['-q', '-hh'] },
  aiff: { name: 'aiff', extension: 'aiff', codec: 'AIFF', args: (bits) => pcm(bits, 'be') },
  // byte swapped PCM (`sowt`), which only AIFF-C holds
  aifc: { name: 'aifc', extension: 'aifc', codec: 'AIFF-C', args: (bits) => [...pcm(bits, 'le'), '-f', 'aiff'] },
  wav: { name: 'wav', extension: 'wav', codec: 'WAV', args: wav },
  rf64: { name: 'rf64', extension: 'wav', codec: 'WAV', args: (bits) => [...wav(bits), '-rf64', 'always'] },
  w64: { name: 'w64', extension: 'w64', codec: 'WAV', args: wav },
  caf: { name: 'caf', extension: 'caf', codec: 'CAF', args: (bits) => pcm(bits, 'be') },
} satisfies Record<string, Form>;

const fixture = ({ name, extension, codec, tool, args }: Form, channels: number, bits: 16 | 24, sampleRate: number): NoiseFixture => ({
  file: `${name}-${channels}ch-${bits}-${sampleRate}.${extension}`,
  codec,
  channels,
  bits,
  sampleRate,
  tool: tool ?? 'ffmpeg',
  args: args(bits),
});

export const noiseFixtures = [
  // every lossless format at both depths
  ...Object.values(forms)
    .flatMap((form) => [fixture(form, 2, 16, 44100), fixture(form, 2, 24, 96000)])
    // ffmpeg writes big endian 24 bit as plain AIFF, and has no other 24 bit PCM for AIFF-C
    .filter(({ file }) => !file.startsWith('aifc-2ch-24')),
  // 5.1, and the high rates
  ...[forms.flac, forms.wav].flatMap((form) => [
    fixture(form, 6, 24, 48000),
    ...[176400, 192000, 384000].map((sampleRate) => fixture(form, 2, 24, sampleRate)),
  ]),
];

/** The interleaved little endian samples that a fixture holds: the same bytes each time, other ones in each channel */
export const noisePcm = ({ channels, bits, sampleRate }: Pick<NoiseFixture, 'channels' | 'bits' | 'sampleRate'>) =>
  createHash('shake256', { outputLength: noiseFrames * channels * (bits / 8) })
    .update(`${channels} ${bits} ${sampleRate}`)
    .digest();
