import { boxAt, childrenOf, mustChild } from './mp4-boxes';
import type { Box } from './mp4-boxes';
import { NotSliceable, SliceError, mustRead } from './types';
import type { ReadRange } from './types';

/** A `moof` box is read whole up to this size; the first bytes of each box are read in one go, which is the whole `moof` of a fragment of seconds */
const maxFragmentBytes = 16 * 1024 * 1024;
const readWindow = 64 * 1024;

/** Where the samples of a track are in the file, and how big they are */
export interface Samples {
  offsets: Float64Array;
  sizes: Uint32Array;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const flagsAt = (bytes: Uint8Array, at: number) => view(bytes).getUint32(at) & 0xffffff;

/** The number of a track, which the fragments name it by (`tkhd`: version and flags, then two times of 4 bytes, or of 8 for version 1) */
export const trackIdOf = (bytes: Uint8Array, track: Box) => {
  const header = mustChild(bytes, track, 'tkhd');
  return view(bytes).getUint32(header.start + (bytes[header.start] === 1 ? 20 : 12));
};

/** The size that a sample has where the fragment says none (`trex`: version and flags, track, description, duration, size, flags) */
export const defaultSizeOf = (bytes: Uint8Array, moov: Box, id: number) => {
  const defaults = childrenOf(bytes, mustChild(bytes, moov, 'mvex'))
    .filter((box) => box.type === 'trex')
    .find((box) => view(bytes).getUint32(box.start + 4) === id);
  if (!defaults) throw new NotSliceable('An MP4 file in fragments without the defaults of its track');
  return view(bytes).getUint32(defaults.start + 16);
};

/** Where the data of a fragment of the track starts, from the header of the track fragment (`tfhd`), and the size its samples have unless they say */
const trackFragmentOf = (bytes: Uint8Array, traf: Box, moofOffset: number, fallbackSize: number) => {
  const header = mustChild(bytes, traf, 'tfhd');
  const data = view(bytes);
  const flags = flagsAt(bytes, header.start);
  const hasBase = (flags & 0x01) !== 0;
  // the fields that are there follow the track number in this order: base offset (8), description (4), duration (4), size (4)
  const sizeAt = header.start + 8 + (hasBase ? 8 : 0) + (flags & 0x02 ? 4 : 0) + (flags & 0x08 ? 4 : 0);
  return {
    id: data.getUint32(header.start + 4),
    base: hasBase ? data.getUint32(header.start + 8) * 2 ** 32 + data.getUint32(header.start + 12) : moofOffset,
    size: flags & 0x10 ? data.getUint32(sizeAt) : fallbackSize,
  };
};

/** The sizes of the samples of a run (`trun`), which follow each other from the offset the run says, or from where the one before ended */
const addRun = (bytes: Uint8Array, run: Box, cursor: { at: number }, size: number, samples: Found) => {
  const data = view(bytes);
  const flags = flagsAt(bytes, run.start);
  const count = data.getUint32(run.start + 4);
  const dataOffset = flags & 0x01 ? data.getInt32(run.start + 8) : undefined;
  const first = run.start + 8 + (flags & 0x01 ? 4 : 0) + (flags & 0x04 ? 4 : 0);
  const sizeAt = flags & 0x100 ? 4 : 0;
  const stride = (flags & 0x100 ? 4 : 0) + (flags & 0x200 ? 4 : 0) + (flags & 0x400 ? 4 : 0) + (flags & 0x800 ? 4 : 0);
  if (first + count * stride > run.end) throw new SliceError('An MP4 file with a run of samples that is cut off');

  if (dataOffset !== undefined) cursor.at += dataOffset;
  for (let index = 0; index < count; index++) {
    const sample = flags & 0x200 ? data.getUint32(first + index * stride + sizeAt) : size;
    samples.offsets.push(cursor.at);
    samples.sizes.push(sample);
    cursor.at += sample;
  }
};

/** The samples of the track that a `moof` box holds */
const addFragment = (bytes: Uint8Array, offset: number, id: number, fallbackSize: number, samples: Found) => {
  const moof = boxAt(bytes, 0);
  childrenOf(bytes, moof)
    .filter((box) => box.type === 'traf')
    .forEach((traf) => {
      const fragment = trackFragmentOf(bytes, traf, offset, fallbackSize);
      if (fragment.id !== id) return;
      // a run without an offset of its own goes on where the one before ended, the first from the start of the data
      const cursor = { at: fragment.base };
      childrenOf(bytes, traf)
        .filter((box) => box.type === 'trun')
        .forEach((run) => addRun(bytes, run, cursor, fragment.size, samples));
    });
};

interface Found {
  offsets: number[];
  sizes: number[];
}

/** The box at `offset`, and the fragment it is when it is a `moof` */
const walkBoxes = async (read: ReadRange, size: number, offset: number, id: number, defaultSize: number, found: Found): Promise<void> => {
  if (offset >= size) return;
  const head = await mustRead(read, offset, Math.min(offset + readWindow, size), 'A box of an MP4 file');
  const box = boxAt(head, 0, size - offset);
  if (box.type === 'moof') {
    if (box.end > maxFragmentBytes) throw new NotSliceable('An MP4 file with a moof box of more than 16 MB');
    const bytes = box.end <= head.length ? head.subarray(0, box.end) : await mustRead(read, offset, offset + box.end, 'A moof box of an MP4 file');
    addFragment(bytes, offset, id, defaultSize, found);
  }
  return walkBoxes(read, size, offset + box.end, id, defaultSize, found);
};

/**
 * The samples of a track of a file in fragments: the boxes after the `moov` box are walked one by one, and each `moof` gives the sizes and the
 * place of the samples of its fragment. The `mdat` boxes are not read
 */
export const fragmentSamples = async (read: ReadRange, size: number, from: number, id: number, defaultSize: number): Promise<Samples> => {
  const found: Found = { offsets: [], sizes: [] };
  await walkBoxes(read, size, from, id, defaultSize, found);
  if (found.sizes.length === 0) throw new NotSliceable('An MP4 file in fragments without samples');
  return { offsets: Float64Array.from(found.offsets), sizes: Uint32Array.from(found.sizes) };
};
