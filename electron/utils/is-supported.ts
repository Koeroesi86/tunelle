import path from 'path';

/** The formats the player plays: the ones Chromium decodes, which the library scan keeps. See docs/app/supported-formats.md */
const supportedFormats = [
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

const isSupported = (filePath: string) => supportedFormats.includes(path.extname(filePath).replace('.', ''));

/** Codecs that sit in a container that plays, which Chromium does not decode. See docs/app/supported-formats.md */
const unsupportedCodecs = ['AC-3', 'SPEEX', 'THEORA', 'DSD-WAVPACK', 'DST', 'WMA-VOICE'];

/** Codecs that Chromium does not decode and that ffmpeg decodes before the track is served. See docs/app/decoder-proxy.md */
const decodedCodecs = ['ALAC', "MONKEY'S", 'WAVPACK', 'AIFF', 'AIFF-C', 'DSD', 'WMA'];

export const isDecodedCodec = (codec: string | null | undefined) => decodedCodecs.includes(codec ?? '');

export const isSupportedCodec = (codec: string | null | undefined) => !unsupportedCodecs.includes(codec ?? '');

export default isSupported;
