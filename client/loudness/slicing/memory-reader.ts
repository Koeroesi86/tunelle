import type { ReadRange, Slice, Slicer } from './types';

/** A file in memory, read like the one of the main process: a range ends where the file does */
export const memoryReader =
  (file: Uint8Array): ReadRange =>
  async (start, end) =>
    file.slice(start, end);

export const collect = async (slicer: Slicer, file: Uint8Array, sliceBytes: number) => {
  const slices: Slice[] = [];
  for await (const slice of slicer(memoryReader(file), file.length, sliceBytes)) slices.push(slice);
  return slices;
};

export const join = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((offset, part) => {
    bytes.set(part, offset);
    return offset + part.length;
  }, 0);
  return bytes;
};
