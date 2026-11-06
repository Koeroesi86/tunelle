import { adtsFrameAt, sliceAdts } from './slice-adts';
import { tagLength } from './slice-frames';
import { sliceFlac } from './slice-flac';
import { sliceMp3 } from './slice-mp3';
import { sliceMp4 } from './slice-mp4';
import { sliceOgg } from './slice-ogg';
import { sliceWav } from './slice-wav';
import type { ReadRange, Slicer } from './types';

const text = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

const mp4Boxes = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'];

/** A row of frames, from after its tag: ADTS (AAC) says so by a header with no layer, MP3 is any other */
const framesSlicer = async (read: ReadRange) => {
  const start = await tagLength(read);
  const head = await read(start, start + 7);
  return head?.length === 7 && adtsFrameAt(head, 0) ? sliceAdts : sliceMp3;
};

/** How to cut a file into pieces a decoder takes as files, from its first bytes; undefined for a format that is not cut */
export const slicerOf = async (read: ReadRange): Promise<Slicer | undefined> => {
  const head = await read(0, 12);
  if (!head) return undefined;
  if (text(head, 0, 4) === 'RIFF' && text(head, 8, 12) === 'WAVE') return sliceWav;
  if (text(head, 0, 4) === 'fLaC') return sliceFlac;
  if (text(head, 0, 4) === 'OggS') return sliceOgg;
  if (mp4Boxes.includes(text(head, 4, 8))) return sliceMp4;
  return text(head, 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ? framesSlicer(read) : undefined;
};
