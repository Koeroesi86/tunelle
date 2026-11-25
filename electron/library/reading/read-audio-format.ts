import type { IFormat } from 'music-metadata';
import type { AudioFormat } from '@shared/types/library';
import { isDsdCodec } from '../../utils/is-supported';

export type ReadFormat = Partial<Pick<IFormat, 'codec' | 'container' | 'codecProfile' | 'lossless' | 'bitsPerSample' | 'sampleRate' | 'bitrate'>>;

const containerCodecs: Record<string, string> = { WAVE: 'WAV' };

const matroskaCodecs = ['FLAC', 'OPUS', 'VORBIS'];

/** DSF, DSDIFF and WavPack hold DSD, which the decoder proxy decodes; DST, the compressed DSDIFF, is named by its codec. See docs/app/supported-formats.md */
const toDsdName = ({ codec, container }: ReadFormat) => {
  if (/^wavpack/i.test(container ?? '')) return /^dsd/i.test(codec ?? '') ? 'DSD' : undefined;
  return /^(dsf|dsdiff)/i.test(container ?? '') && (!codec || /^dsd/i.test(codec)) ? 'DSD' : undefined;
};

/** Only FLAC, Opus and Vorbis are decoded from Matroska and WebM; another codec in them is named by its container, as Chromium does not play `.mka` either. See docs/app/supported-formats.md */
const toMatroskaName = ({ codec, container }: ReadFormat) => {
  if (!codec || !/matroska|webm/i.test(container ?? '')) return undefined;
  const name = (codec ?? '').replace(/\s.*/, '').toUpperCase();
  return matroskaCodecs.includes(name) ? undefined : `MATROSKA-${name}`;
};

const cafCodecs: Record<string, string | undefined> = {
  PCM: 'CAF',
  ALAC: 'ALAC',
  'ITU-T G.711 A-law': 'ALAW',
  'ITU-T G.711 mu-law': 'MULAW',
};

/** Only PCM, ALAC, A-law and µ-law are decoded from CAF; another codec in it (AAC, IMA4, MP3) is named by its container and not stored. See docs/app/supported-formats.md */
const toCafName = ({ codec, container }: ReadFormat) => {
  if (!codec || !/^caf$/i.test(container ?? '')) return undefined;
  return cafCodecs[codec] ?? `CAF-${codec.toUpperCase()}`;
};

/** Windows Media Audio is named WMA; the voice codecs are told apart, as the decoder proxy does not play them. See docs/app/supported-formats.md */
const toWmaName = (codec: string | undefined) => {
  if (!/^windows media audio/i.test(codec ?? '')) return undefined;
  return /voice|speech/i.test(codec ?? '') ? 'WMA-VOICE' : 'WMA';
};

/** The name the badge shows: MPEG layers are named by their common name, PCM by its container, the rest by the first word of the codec */
const toCodecName = ({ codec, container }: ReadFormat) => {
  if (!codec && !container) return null;
  const dsd = toDsdName({ codec, container });
  if (dsd) return dsd;
  const wma = toWmaName(codec);
  if (wma) return wma;
  const matroska = toMatroskaName({ codec, container });
  if (matroska) return matroska;
  const caf = toCafName({ codec, container });
  if (caf) return caf;
  if (/layer 3/i.test(codec ?? '')) return 'MP3';
  if (/layer 2/i.test(codec ?? '')) return 'MP2';
  const name = !codec || /^pcm/i.test(codec) ? (container ?? '') : codec;
  return containerCodecs[name.toUpperCase()] ?? name.replace(/\s.*/, '').toUpperCase();
};

const toFlag = (value: boolean | undefined) => (value === undefined ? null : Number(value));

/** The encoding of a file; a variable bitrate shows in the profile of the codec (`VBR`, `V0`), a constant (`CBR`) or an average (`ABR`) one does not */
const readAudioFormat = (format: ReadFormat): AudioFormat => ({
  codec: toCodecName(format),
  bitDepth: isDsdCodec(toCodecName(format)) ? 1 : (format.bitsPerSample ?? null),
  sampleRate: format.sampleRate ?? null,
  bitrate: format.bitrate ? Math.round(format.bitrate) : null,
  vbr: format.codecProfile ? Number(/^V/i.test(format.codecProfile)) : null,
  lossless: toFlag(format.lossless ?? (isDsdCodec(toCodecName(format)) || /lossless/i.test(format.codec ?? '') ? true : undefined)),
});

export default readAudioFormat;
