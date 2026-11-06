import { sliceFlac } from './slice-flac';
import { sliceMp3 } from './slice-mp3';
import { sliceWav } from './slice-wav';
import type { ReadRange, Slicer } from './types';

const text = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

/** How to cut a file into pieces a decoder takes as files, from its first bytes; undefined for a format that is not cut yet */
export const slicerOf = async (read: ReadRange): Promise<Slicer | undefined> => {
  const head = await read(0, 12);
  if (!head) return undefined;
  if (text(head, 0, 4) === 'RIFF' && text(head, 8, 12) === 'WAVE') return sliceWav;
  if (text(head, 0, 4) === 'fLaC') return sliceFlac;
  return text(head, 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ? sliceMp3 : undefined;
};
