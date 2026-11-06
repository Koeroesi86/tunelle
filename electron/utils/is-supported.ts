import path from 'path';

/** The formats the player plays: the ones Chromium decodes, which the library scan keeps. See docs/app/supported-formats.md */
const supportedFormats = ['flac', 'm4a', 'm4b', 'm4r', 'mp4', 'aac', 'mp3', 'oga', 'ogg', 'opus', 'wav'];

const isSupported = (filePath: string) => supportedFormats.includes(path.extname(filePath).replace('.', ''));

/** Codecs that sit in a container that plays, which Chromium does not decode. See docs/app/supported-formats.md */
const unsupportedCodecs = ['ALAC', 'AC-3', 'SPEEX'];

export const isSupportedCodec = (codec: string | null | undefined) => !unsupportedCodecs.includes(codec ?? '');

export default isSupported;
