/** Reads the bytes from `start` up to `end` (not included) of the file; fewer at the end of the file, undefined when it cannot be read */
export type ReadRange = (start: number, end: number) => Promise<Uint8Array | undefined>;

/** A piece of a file that a decoder takes as a file of its own */
export interface Slice {
  bytes: Uint8Array;
  /** How much of the start of the decoded piece is left out, in seconds: the part that only gives the decoder what it needs of the piece before */
  skip: number;
  /** Or how much of the end of the decoded piece is kept, in seconds, for a format that tells the length of what comes after the cut and not of what the decoder is given before it */
  keep?: number;
}

/** Cuts a file into pieces of about `sliceBytes`, one after the other */
export type Slicer = (read: ReadRange, size: number, sliceBytes: number) => AsyncGenerator<Slice>;

/** Thrown when the file is not what its header says, which is the end of its measurement */
export class SliceError extends Error {}

/** Thrown for a file of a format that is cut, in a variant that is not: its measurement is `too-large`, as for a format that is not cut at all */
export class NotSliceable extends SliceError {}

/** The bytes of a range, or the end of the measurement of a file that cannot be read whole */
export const mustRead = async (read: ReadRange, start: number, end: number, what: string) => {
  const bytes = await read(start, end);
  if (!bytes) throw new SliceError(`${what} could not be read`);
  return bytes;
};

/** The bytes of a header followed by the bytes of a piece, which the decoder takes as a file */
export const withHeader = (header: Uint8Array, body: Uint8Array) => {
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  return bytes;
};
