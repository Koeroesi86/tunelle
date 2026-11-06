import { SliceError } from './types';
import type { ReadRange } from './types';

const windowBytes = 65_536;
const windows = 16;
/** How far `findCut` looks from where it starts */
const searchSpan = windows * (windowBytes - 64);

/**
 * The first offset from `from` where `isStart` holds for the bytes there, looking in windows of 64 KB up to 1 MB far. `isStart` sees the bytes from
 * the offset on, as many as the window has left. Undefined when there is none
 */
export const findCut = async (read: ReadRange, from: number, size: number, isStart: (bytes: Uint8Array, offset: number) => boolean) => {
  for (let index = 0; index < windows; index++) {
    const start = from + index * (windowBytes - 64);
    if (start >= size) return undefined;
    // the windows overlap by 64 bytes, so a header that crosses the end of one is whole in the next
    const bytes = await read(start, Math.min(start + windowBytes, size));
    const found = bytes?.findIndex((_, offset) => offset + 64 <= bytes.length && isStart(bytes, offset));
    if (found !== undefined && found >= 0) return start + found;
  }
  return undefined;
};

/** The offsets of the cuts of a file that starts at `first`: each about `sliceBytes` after the one before, the end of the file last */
export const cutsOf = async (read: ReadRange, first: number, size: number, sliceBytes: number, isStart: (bytes: Uint8Array, offset: number) => boolean) => {
  const cuts = [first];
  while (cuts[cuts.length - 1] + sliceBytes < size) {
    const cut = await findCut(read, cuts[cuts.length - 1] + sliceBytes, size, isStart);
    // no start in what is left of the file is the end of it, no start in the 1 MB that was searched is a file that is not what it says
    if (cut === undefined && cuts[cuts.length - 1] + sliceBytes + searchSpan < size) throw new SliceError('No start of a piece in 1 MB');
    if (cut === undefined) break;
    cuts.push(cut);
  }
  return [...cuts, size];
};
