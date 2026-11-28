import { describe, expect, it } from 'vitest';
import { sliceFlac } from './slice-flac';
import { collect, join } from './memory-reader';

const crc8 = (bytes: number[]) =>
  bytes.reduce((crc, byte) => {
    let value = crc ^ byte;
    for (let bit = 0; bit < 8; bit++) value = value & 0x80 ? ((value << 1) ^ 0x07) & 0xff : (value << 1) & 0xff;
    return value;
  }, 0);

/** The header of a frame of 4096 samples at 44.1 kHz in stereo and 16 bits, numbered `number` (under 128), with its CRC-8 */
const frame = (number: number, length = 900) => {
  const header = [0xff, 0xf8, 0xc9, 0x18, number];
  return Uint8Array.from([...header, crc8(header), ...Array.from({ length: length - 6 }, (_, index) => 1 + ((index + number) % 200))]);
};

const marker = Uint8Array.from([0x66, 0x4c, 0x61, 0x43]);
/** STREAMINFO is the last block of the metadata of this file */
const metadata = join(marker, Uint8Array.from([0x80, 0, 0, 34]), new Uint8Array(34).fill(7));

describe('sliceFlac', () => {
  const frames = Array.from({ length: 100 }, (_, index) => frame(index));
  const file = join(metadata, ...frames);

  it('cuts at the start of a frame, with the metadata of the file in front of each piece', async () => {
    const slices = await collect(sliceFlac, file, 10_000);

    expect(slices.length).toBeGreaterThan(5);
    slices.forEach(({ bytes, skip }) => {
      expect(bytes.subarray(0, metadata.length)).toEqual(metadata);
      expect(bytes.subarray(metadata.length, metadata.length + 2)).toEqual(Uint8Array.from([0xff, 0xf8]));
      expect(skip).toBe(0);
    });
    expect(join(...slices.map(({ bytes }) => bytes.subarray(metadata.length)))).toEqual(join(...frames));
  });

  it('does not cut at a sync code in the sound that has no valid header', async () => {
    // the sound of the frames holds the sync code of a frame, with the wrong CRC-8
    const bad = join(frame(0, 900).subarray(0, 450), Uint8Array.from([0xff, 0xf8, 0xc9, 0x18, 5, 0]), frame(0, 900).subarray(456));
    const slices = await collect(sliceFlac, join(metadata, bad, ...frames.slice(1)), 400);

    expect(slices[0].bytes.length).toBe(metadata.length + 900);
  });

  it('leaves out an ID3v2 tag in front of the marker and an ID3v1 tag after the last frame', async () => {
    const front = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4]);
    const back = Uint8Array.from([0x54, 0x41, 0x47, ...new Array(125).fill(9)]);
    const slices = await collect(sliceFlac, join(front, metadata, ...frames, back), 10_000);

    slices.forEach(({ bytes }) => expect(bytes.subarray(0, metadata.length)).toEqual(metadata));
    expect(join(...slices.map(({ bytes }) => bytes.subarray(metadata.length)))).toEqual(join(...frames));
  });

  it('rejects a file without the marker', async () => {
    await expect(collect(sliceFlac, new Uint8Array(100), 50)).rejects.toThrow('marker');
  });

  it('rejects a file whose metadata goes past its end', async () => {
    await expect(collect(sliceFlac, join(marker, Uint8Array.from([0x80, 0, 1, 0])), 50)).rejects.toThrow('goes past its end');
  });

  /** A frame with a header of its own: the byte of block size and rate, the bytes of its number, and the ones that give the size and rate in full */
  const frameWith = (sizes: number, number: number[], extra: number[], length = 900) => {
    const header = [0xff, 0xf8, sizes, 0x18, ...number, ...extra];
    const sound = Array.from({ length: length - header.length - 1 }, (_, index) => 1 + (index % 200));
    return Uint8Array.from([...header, crc8(header), ...sound]);
  };
  const framesWith = (sizes: number, number: number[], extra: number[]) =>
    join(metadata, ...Array.from({ length: 100 }, () => frameWith(sizes, number, extra)));

  it.each([
    ['a number of two bytes', 0xc9, [0xc2, 0x80], []],
    ['a number of seven bytes', 0xc9, [0xfe, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80], []],
    ['a block size in one more byte', 0x69, [1], [200]],
    ['a block size in two more bytes', 0x79, [1], [1, 0]],
    ['a rate in kHz in one more byte', 0xcc, [1], [44]],
    ['a rate in Hz in two more bytes', 0xcd, [1], [172, 68]],
    ['a rate in tens of Hz in two more bytes', 0xce, [1], [17, 58]],
  ])('cuts at frames with %s', async (_, sizes, number, extra) => {
    expect((await collect(sliceFlac, framesWith(sizes, number, extra), 10_000)).length).toBeGreaterThan(5);
  });

  it.each([
    ['starts like a later byte of one', [0x80]],
    ['is longer than seven bytes', [0xff]],
  ])('does not cut where the number of the frame %s', async (_, number) => {
    expect(await collect(sliceFlac, framesWith(0xc9, number, []), 10_000)).toHaveLength(1);
  });

  it('rejects metadata of more than 16 MB before reading it', async () => {
    await expect(collect(sliceFlac, join(marker, Uint8Array.from([0x80, 0xff, 0xff, 0xff])), 50)).rejects.toThrow('more than 16 MB');
  });
});
