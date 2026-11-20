import path from 'path';

/** The formats the player plays: the ones Chromium decodes, which the library scan keeps. See docs/app/supported-formats.md */
export const supportedFormats = [
  'flac',
  'm4a',
  'm4b',
  'm4r',
  'aac',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'ape',
  'wv',
  'aif',
  'aiff',
  'aifc',
  'dsf',
  'dff',
  'wma',
  'asf',
];

const isSupported = (filePath: string) => supportedFormats.includes(path.extname(filePath).replace('.', '').toLowerCase());

/** Codecs that sit in a container that plays, which Chromium does not decode. See docs/app/supported-formats.md */
const unsupportedCodecs = ['AC-3', 'SPEEX', 'THEORA', 'DSD-WAVPACK', 'DST', 'WMA-VOICE'];

/** Codecs that Chromium does not decode and that ffmpeg decodes before the track is served. See docs/app/decoder-proxy.md */
const decodedCodecs = ['FLAC', 'ALAC', "MONKEY'S", 'WAVPACK', 'AIFF', 'AIFF-C', 'DSD', 'WMA'];

/** Decoded codecs whose length in frames is exact before the decode, so the WAV is served while it is written. See docs/app/decoder-proxy.md */
const progressiveCodecs = ['ALAC', 'FLAC', "MONKEY'S", 'WAVPACK', 'AIFF', 'AIFF-C'];

export const isProgressiveCodec = (codec: string | null | undefined) => progressiveCodecs.includes(codec ?? '');

export const isDecodedCodec = (codec: string | null | undefined) => decodedCodecs.includes(codec ?? '');

export const isSupportedCodec = (codec: string | null | undefined) => !unsupportedCodecs.includes(codec ?? '');

export default isSupported;
