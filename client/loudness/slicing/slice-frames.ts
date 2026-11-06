import { findCut, cutsOf } from './find-cut';
import type { StartTest } from './find-cut';
import { SliceError, mustRead } from './types';
import type { ReadRange, Slicer } from './types';

/** The length in bytes and the duration of one frame of a format that is a row of frames */
export interface Frame {
  length: number;
  seconds: number;
}

/** The frame whose header is at `offset` of the bytes, undefined where there is no header */
export type FrameAt = (bytes: Uint8Array, offset: number) => Frame | undefined;

const headerBytes = 4;
/** Frames that follow each other: the header at `offset`, and the ones after it, are all headers where the length of the frame says */
const startsFrames = (frameAt: FrameAt, bytes: Uint8Array, offset: number, count: number): boolean => {
  const frame = frameAt(bytes, offset);
  if (!frame) return false;
  const next = offset + frame.length;
  // a frame that ends past the window is taken to be one
  return count === 1 || next + headerBytes > bytes.length || startsFrames(frameAt, bytes, next, count - 1);
};

/** The size of the tag at the start (ID3v2: 10 bytes of header, its size in 7 bits of 4 bytes, and a footer if the flag says) */
export const tagLength = async (read: ReadRange) => {
  const head = await read(0, 10);
  if (!head) throw new SliceError('A file that could not be read');
  const isTag = head.length === 10 && String.fromCharCode(...head.subarray(0, 3)) === 'ID3';
  return isTag ? 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]) + (head[5] & 0x10 ? 10 : 0) : 0;
};

/** About two frames of the largest size, which the decoder needs of the piece before */
const leadInBytes = 3000;

/**
 * A file that is a row of frames is cut at the start of a frame (found where three headers follow each other by their lengths). Each piece but
 * the first starts a few frames early, which the decoder needs of the piece before and which are left out of what is measured
 */
export const framesSlicer = (frameAt: FrameAt, what: string): Slicer => {
  const isStart: StartTest = (bytes, offset) => startsFrames(frameAt, bytes, offset, 3);
  const playTime = (bytes: Uint8Array, offset = 0): number => {
    const frame = frameAt(bytes, offset);
    return frame ? frame.seconds + playTime(bytes, offset + frame.length) : 0;
  };
  const leadIn = async (read: ReadRange, cut: number, size: number) => {
    const start = (await findCut(read, Math.max(cut - leadInBytes, 0), size, isStart)) ?? cut;
    return { start, seconds: playTime(await mustRead(read, start, cut, `The frames before a piece of ${what}`)) };
  };

  return async function* (read, size, sliceBytes) {
    const first = await findCut(read, await tagLength(read), size, isStart);
    if (first === undefined) throw new SliceError(`${what} without a frame`);
    const cuts = await cutsOf(read, first, size, sliceBytes, isStart);

    for (let index = 0; index < cuts.length - 1; index++) {
      const lead = index === 0 ? { start: cuts[0], seconds: 0 } : await leadIn(read, cuts[index], size);
      yield { bytes: await mustRead(read, lead.start, cuts[index + 1], `A piece of ${what}`), skip: lead.seconds };
    }
  };
};
