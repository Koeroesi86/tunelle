import path from 'path';

/** The formats the player plays: the ones Chromium decodes, which the library scan keeps. See docs/app/supported-formats.md */
export const supportedFormats = [
  'flac',
  'm4a',
  'm4b',
  'm4r',
  'aac',
  'mp3',
  'mp2',
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
  'mka',
  'weba',
  'w64',
  'caf',
];

const isSupported = (filePath: string) => supportedFormats.includes(path.extname(filePath).replace('.', '').toLowerCase());

/** Codecs that sit in a container that plays, which Chromium does not decode. See docs/app/supported-formats.md */
const unsupportedCodecs = ['SPEEX', 'THEORA', 'WMA-VOICE'];

/** Codecs that Chromium does not decode and that ffmpeg decodes before the track is served. See docs/app/decoder-proxy.md */
const decodedCodecs = [
  'FLAC',
  'VORBIS',
  'ALAC',
  "MONKEY'S",
  'WAVPACK',
  'AIFF',
  'AIFF-C',
  'DSD',
  'DST',
  'WMA',
  'WAV',
  'CAF',
  'IEEE_FLOAT',
  'ADPCM',
  'DVI_ADPCM',
  'ALAW',
  'MULAW',
  'MP3',
  'OPUS',
  'MP2',
  'AC-3',
];

/** Decoded codecs whose length in frames is exact before the decode, so the WAV is served while it is written. See docs/app/decoder-proxy.md */
const progressiveCodecs = ['ALAC', 'FLAC', "MONKEY'S", 'WAVPACK', 'AIFF', 'AIFF-C', 'WAV', 'CAF', 'IEEE_FLOAT'];

/** Decoded codecs that Chromium plays too: where the bundled ffmpeg has no decoder for one (the Flatpak build, see docs/development/ffmpeg-build.md), the file is served as it is */
const chromiumCodecs = ['MP3'];

export const isChromiumCodec = (codec: string | null | undefined) => chromiumCodecs.includes(codec ?? '');

export const isProgressiveCodec = (codec: string | null | undefined) => progressiveCodecs.includes(codec ?? '');

/** 1 bit audio, as it is (DSD) or compressed (DST) */
const dsdCodecs = ['DSD', 'DST'];

export const isDsdCodec = (codec: string | null | undefined) => dsdCodecs.includes(codec ?? '');

export const isDecodedCodec = (codec: string | null | undefined) => decodedCodecs.includes(codec ?? '');

/** `MATROSKA-<codec>` and `CAF-<codec>` are codecs in a container that are not one of the decoded ones, see `electron/library/reading/read-audio-format.ts` */
export const isSupportedCodec = (codec: string | null | undefined) => !unsupportedCodecs.includes(codec ?? '') && !/^(MATROSKA|CAF)-/.test(codec ?? '');

export default isSupported;
