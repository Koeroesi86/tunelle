import { isDsdCodec, isFloatCodec } from '../utils/is-supported';

export interface Format {
  codec: string | null;
  bitDepth: number | null;
}

/**
 * The WAV keeps the depth of the file, 16 bit when it is not known; lossy and float audio, which can go over full scale, is 32 bit float;
 * DSD and DST, which have 1 bit, are 88.2 kHz and 24 bit whatever their rate. See docs/app/decoder-formats.md
 */
export const toEncoder = ({ codec, bitDepth }: Format, floatFile = false) => {
  if (isDsdCodec(codec)) return ['-ar', '88200', '-c:a', 'pcm_s24le'];
  if (floatFile || isFloatCodec(codec)) return ['-c:a', 'pcm_f32le'];
  return ['-c:a', (bitDepth ?? 16) > 24 ? 'pcm_s32le' : (bitDepth ?? 16) > 16 ? 'pcm_s24le' : 'pcm_s16le'];
};
