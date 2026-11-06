import { join } from './memory-reader';

const u32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const text = (value: string) => [...value].map((letter) => letter.charCodeAt(0));

/** A box of an MP4 file: its size, its type and its content */
export const box = (type: string, ...content: Uint8Array[]) => {
  const body = join(...content);
  return join(Uint8Array.from([...u32(body.length + 8), ...text(type)]), body);
};

const fullBox = (type: string, ...content: (Uint8Array | number[])[]) =>
  box(type, Uint8Array.from([0, 0, 0, 0]), ...content.map((part) => Uint8Array.from(part)));

/** The AudioSpecificConfig of AAC LC (2) at 44.1 kHz (4) in stereo, in the descriptors of an `esds` box */
export const esds = (objectType = 2, indication = 0x40) => {
  const config = [(objectType << 3) | (4 >> 1), ((4 & 1) << 7) | (2 << 3)];
  const specific = [0x05, config.length, ...config];
  const decoder = [0x04, 13 + specific.length, indication, 0x15, ...new Array(11).fill(0), ...specific];
  return fullBox('esds', [0x03, 3 + decoder.length, 0, 1, 0, ...decoder]);
};

/** The sample description of an entry that is `format` with the boxes after the 28 bytes of the fields of a sound entry */
export const description = (format: string, ...content: Uint8Array[]) =>
  fullBox('stsd', u32(1), box(format, new Uint8Array(6), Uint8Array.from([0, 1]), new Uint8Array(16), Uint8Array.from([0xac, 0x44, 0, 0]), ...content));

interface Layout {
  sizes: number[];
  /** The samples in each chunk: all in one chunk, or runs of this many */
  perChunk: number;
  offsetOfFirstChunk: number;
  large?: boolean;
  entry?: Uint8Array;
  handler?: string;
  fragments?: boolean;
  /** The bytes between the chunks, which belong to another track */
  gap?: number;
}

/** The sizes of the sample table of `stsz`, one for each sample, with the chunks `stsc` and their offsets (`stco`, or `co64` when `large`) */
export const movie = ({
  sizes,
  perChunk,
  offsetOfFirstChunk,
  large = false,
  entry = description('mp4a', esds()),
  handler = 'soun',
  fragments = false,
  gap = 0,
}: Layout) => {
  const chunks = Math.ceil(sizes.length / perChunk);
  let offset = offsetOfFirstChunk;
  const offsets = Array.from({ length: chunks }, (_, chunk) => {
    const at = offset;
    offset += gap + sizes.slice(chunk * perChunk, (chunk + 1) * perChunk).reduce((total, size) => total + size, 0);
    return at;
  });
  const table = [
    entry,
    fullBox('stsz', u32(0), u32(sizes.length), sizes.flatMap(u32)),
    fullBox('stsc', u32(1), u32(1), u32(perChunk), u32(1)),
    large
      ? fullBox(
          'co64',
          u32(chunks),
          offsets.flatMap((at) => [...u32(0), ...u32(at)])
        )
      : fullBox('stco', u32(chunks), offsets.flatMap(u32)),
  ];
  const track = box('trak', box('mdia', fullBox('hdlr', u32(0), text(handler), new Uint8Array(13)), box('minf', box('stbl', ...table))));
  return box('moov', box('mvhd', new Uint8Array(100)), track, ...(fragments ? [box('mvex')] : []));
};

/** The sample of the file: `size` bytes that are all `marker` */
export const sample = (marker: number, size: number) => new Uint8Array(size).fill(marker);
