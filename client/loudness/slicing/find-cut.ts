import { SliceError } from './types';
import type { ReadRange } from './types';

const windowBytes = 65_536;
const windows = 16;
/** The windows overlap by 64 bytes, so a header that crosses the end of one is whole in the next */
const windowStep = windowBytes - 64;
/** How far `findCut` looks from where it starts */
const searchSpan = windows * windowStep;

/** Tells whether a piece starts at the offset, from the bytes of the window: as many as it has left */
export type StartTest = (bytes: Uint8Array, offset: number) => boolean;

const searchWindow = async (read: ReadRange, from: number, size: number, isStart: StartTest, index: number): Promise<number | undefined> => {
  const start = from + index * windowStep;
  if (index >= windows || start >= size) return undefined;

  const bytes = await read(start, Math.min(start + windowBytes, size));
  const found = bytes?.findIndex((_, offset) => offset + 64 <= bytes.length && isStart(bytes, offset)) ?? -1;
  return found >= 0 ? start + found : searchWindow(read, from, size, isStart, index + 1);
};

/** The first offset from `from` where `isStart` holds, looking in windows of 64 KB up to 1 MB far. Undefined when there is none */
export const findCut = (read: ReadRange, from: number, size: number, isStart: StartTest) => searchWindow(read, from, size, isStart, 0);

const cutsFrom = async (read: ReadRange, cuts: number[], size: number, sliceBytes: number, isStart: StartTest): Promise<number[]> => {
  const from = cuts[cuts.length - 1] + sliceBytes;
  if (from >= size) return cuts;

  const cut = await findCut(read, from, size, isStart);
  // no start in what is left of the file is the end of it, no start in the 1 MB that was searched is a file that is not what it says
  if (cut === undefined && from + searchSpan < size) throw new SliceError('No start of a piece in 1 MB');
  return cut === undefined ? cuts : cutsFrom(read, [...cuts, cut], size, sliceBytes, isStart);
};

/** The offsets of the cuts of a file that starts at `first`: each about `sliceBytes` after the one before, the end of the file last */
export const cutsOf = async (read: ReadRange, first: number, size: number, sliceBytes: number, isStart: StartTest) => [
  ...(await cutsFrom(read, [first], size, sliceBytes, isStart)),
  size,
];
