/** Reads the bytes from `start` up to `end` (not included) of the file; fewer at the end of the file, undefined when it cannot be read */
export type ReadRange = (start: number, end: number) => Promise<Uint8Array | undefined>;

/** A piece of a file that a decoder takes as a file of its own */
export interface Slice {
  bytes: Uint8Array;
  /** How much of the start of the decoded piece is left out, in seconds: the part that only gives the decoder what it needs of the piece before */
  skip: number;
}

/** Cuts a file into pieces of about `sliceBytes`, one after the other */
export type Slicer = (read: ReadRange, size: number, sliceBytes: number) => AsyncGenerator<Slice>;

/** Thrown when the file is not what its header says, which is the end of its measurement */
export class SliceError extends Error {}

/** The bytes of a range, or the end of the measurement of a file that cannot be read whole */
export const mustRead = async (read: ReadRange, start: number, end: number, what: string) => {
  const bytes = await read(start, end);
  if (!bytes) throw new SliceError(`${what} could not be read`);
  return bytes;
};
