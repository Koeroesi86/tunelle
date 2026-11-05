import path from 'path';

/** The formats the player plays: the ones Chromium decodes, which the library scan keeps. See docs/app/supported-formats.md */
const supportedFormats = ['flac', 'm4a', 'm4b', 'm4p', 'm4v', 'm4r', '3gp', 'mp4', 'aac', 'mp3', 'ogv', 'oga', 'ogx', 'ogg', 'opus', 'wav'];

const isSupported = (filePath: string) => supportedFormats.includes(path.extname(filePath).replace('.', ''));

/** ALAC is stored in an .m4a file, which plays, but Chromium does not decode the codec */
export const isSupportedCodec = (codec: string | null | undefined) => codec !== 'ALAC';

export default isSupported;
