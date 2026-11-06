import { cutsOf } from './find-cut';
import { SliceError } from './types';
import type { ReadRange, Slicer } from './types';

const maxMetadata = 16 * 1024 * 1024;

/** The CRC-8 of the header of a frame (polynomial 0x07) */
const crc8 = (bytes: Uint8Array) =>
  bytes.reduce((crc, byte) => {
    const step = (value: number) => ((value & 0x80) === 0 ? (value << 1) & 0xff : ((value << 1) ^ 0x07) & 0xff);
    return Array.from({ length: 8 }).reduce<number>((value) => step(value), crc ^ byte);
  }, 0);

/** How many bytes the number of a frame (UTF-8 coded, up to 7 bytes) takes, from its first byte; 0 for one that cannot start it */
const numberBytes = (first: number) => {
  if (first < 0x80) return 1;
  const length = Math.clz32(~(first << 24));
  return first >= 0xc0 && length <= 7 ? length : 0;
};

/**
 * A frame starts with the sync code, a header whose fields are allowed and a CRC-8 that holds for it: a sync code alone is found in sound too often
 * to cut at it
 */
const startsFrame = (bytes: Uint8Array, offset: number) => {
  const [sync, flags, sizes, layout] = [bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]];
  const blockSize = sizes >> 4;
  const rate = sizes & 15;
  if (sync !== 0xff || (flags & 0xfe) !== 0xf8 || blockSize === 0 || rate === 15 || layout >> 4 > 10 || ((layout >> 1) & 7) === 3 || (layout & 1) === 1)
    return false;

  const number = numberBytes(bytes[offset + 4]);
  const extra = (blockSize === 6 ? 1 : blockSize === 7 ? 2 : 0) + (rate === 12 ? 1 : rate === 13 || rate === 14 ? 2 : 0);
  const length = 4 + number + extra;
  return number > 0 && offset + length < bytes.length && crc8(bytes.subarray(offset, offset + length)) === bytes[offset + length];
};

/** The stream marker and the metadata blocks, which every piece starts with, and where the first frame is */
const headerOf = async (read: ReadRange) => {
  const marker = await read(0, 4);
  if (!marker || String.fromCharCode(...marker) !== 'fLaC') throw new SliceError('A FLAC file without its marker');
  let offset = 4;
  for (let last = false; !last;) {
    const block = await read(offset, offset + 4);
    if (!block || block.length < 4) throw new SliceError('A FLAC file with metadata that ends early');
    last = (block[0] & 0x80) !== 0;
    offset += 4 + ((block[1] << 16) | (block[2] << 8) | block[3]);
    if (offset > maxMetadata) throw new SliceError('A FLAC file with metadata of more than 16 MB');
  }
  const header = await read(0, offset);
  if (!header) throw new SliceError('A FLAC file whose metadata could not be read');
  return { header, firstFrame: offset };
};

/** A FLAC file is cut at the start of a frame, and each piece is given the metadata of the file in front, which the decoder takes as a file of its own */
export const sliceFlac: Slicer = async function* (read, size, sliceBytes) {
  const { header, firstFrame } = await headerOf(read);
  const cuts = await cutsOf(read, firstFrame, size, sliceBytes, startsFrame);

  for (let index = 0; index < cuts.length - 1; index++) {
    const frames = await read(cuts[index], cuts[index + 1]);
    if (!frames) throw new SliceError('A piece of a FLAC file could not be read');
    const bytes = new Uint8Array(header.length + frames.length);
    bytes.set(header);
    bytes.set(frames, header.length);
    yield { bytes, skip: 0 };
  }
};
