import { NotSliceable, SliceError } from './types';

/** A box of an MP4 file: where its content starts and ends in the bytes it was read from */
export interface Box {
  type: string;
  start: number;
  end: number;
}

const type = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));

/** The box at `offset` of the bytes, with its content: a size of 1 is followed by one of 64 bits, a size of 0 goes to `limit`, which is the end of what holds it */
export const boxAt = (bytes: Uint8Array, offset: number, limit = bytes.length): Box => {
  if (offset + 8 > limit) throw new SliceError('An MP4 file with a box that is cut off');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = data.getUint32(offset);
  const isLarge = size === 1;
  const header = isLarge ? 16 : 8;
  const length = isLarge ? data.getUint32(offset + 8) * 2 ** 32 + data.getUint32(offset + 12) : size || limit - offset;
  if (length < header || offset + length > limit) throw new SliceError('An MP4 file with a box of a size that does not fit');
  return { type: type(bytes, offset + 4), start: offset + header, end: offset + length };
};

/** The boxes inside a box, one after the other */
export const childrenOf = (bytes: Uint8Array, parent: Box, from = parent.start): Box[] => {
  if (from + 8 > parent.end) return [];
  const box = boxAt(bytes, from, parent.end);
  return [box, ...childrenOf(bytes, parent, box.end)];
};

/** The first box of a type inside a box, undefined when there is none */
export const childOf = (bytes: Uint8Array, parent: Box, name: string) => childrenOf(bytes, parent).find((box) => box.type === name);

/** The box of a type that a file must have */
export const mustChild = (bytes: Uint8Array, parent: Box, name: string) => {
  const box = childOf(bytes, parent, name);
  if (!box) throw new NotSliceable(`An MP4 file without a ${name} box`);
  return box;
};
