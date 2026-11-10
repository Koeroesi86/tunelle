import type { IFormat } from 'music-metadata';
import type { AudioFormat } from '@shared/types/library';

type ReadFormat = Partial<Pick<IFormat, 'codec' | 'container' | 'codecProfile' | 'lossless' | 'bitsPerSample' | 'sampleRate' | 'bitrate'>>;

const containerCodecs: Record<string, string> = { WAVE: 'WAV' };

/** DSF and DSDIFF hold DSD; a WavPack file that holds it is told apart, as the decoder proxy plays the first two only. See docs/app/supported-formats.md */
const toDsdName = ({ codec, container }: ReadFormat) => {
  if (/^wavpack/i.test(container ?? '')) return /^dsd/i.test(codec ?? '') ? 'DSD-WAVPACK' : undefined;
  return /^(dsf|dsdiff)/i.test(container ?? '') && (!codec || /^dsd/i.test(codec)) ? 'DSD' : undefined;
};

/** The name the badge shows: MPEG layers are named by their common name, PCM by its container, the rest by the first word of the codec */
const toCodecName = ({ codec, container }: ReadFormat) => {
  if (!codec && !container) return null;
  const dsd = toDsdName({ codec, container });
  if (dsd) return dsd;
  if (/layer 3/i.test(codec ?? '')) return 'MP3';
  if (/layer 2/i.test(codec ?? '')) return 'MP2';
  const name = !codec || /^pcm/i.test(codec) ? (container ?? '') : codec;
  return containerCodecs[name.toUpperCase()] ?? name.replace(/\s.*/, '').toUpperCase();
};

const toFlag = (value: boolean | undefined) => (value === undefined ? null : Number(value));

/** The encoding of a file; a variable bitrate shows in the profile of the codec (`VBR`, `V0`), a constant (`CBR`) or an average (`ABR`) one does not */
const readAudioFormat = (format: ReadFormat): AudioFormat => ({
  codec: toCodecName(format),
  bitDepth: format.bitsPerSample ?? null,
  sampleRate: format.sampleRate ?? null,
  bitrate: format.bitrate ? Math.round(format.bitrate) : null,
  vbr: format.codecProfile ? Number(/^V/i.test(format.codecProfile)) : null,
  lossless: toFlag(format.lossless ?? (toCodecName(format) === 'DSD' ? true : undefined)),
});

export default readAudioFormat;
