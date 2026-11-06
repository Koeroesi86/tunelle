import { aacSampleRates } from './adts';
import { framesSlicer } from './slice-frames';
import type { Frame } from './slice-frames';

/** The frame (one or more blocks of 1024 samples) whose ADTS header is at `offset`, undefined where there is none: 12 bits of sync, no layer */
export const adtsFrameAt = (bytes: Uint8Array, offset: number): Frame | undefined => {
  const [first, second, third, fourth, fifth, sixth, seventh] = bytes.subarray(offset, offset + 7);
  const sampleRate = aacSampleRates[(third >> 2) & 15];
  const length = ((fourth & 3) << 11) | (fifth << 3) | (sixth >> 5);
  if (first !== 0xff || (second & 0xf6) !== 0xf0 || !sampleRate || length < (second & 1 ? 7 : 9)) return undefined;

  return { length, seconds: (((seventh ?? 0) & 3) + 1) * (1024 / sampleRate) };
};

/** A file of AAC frames with ADTS headers (`.aac`) is cut at the start of a frame, each piece but the first starting a few frames early */
export const sliceAdts = framesSlicer(adtsFrameAt, 'An AAC file');
