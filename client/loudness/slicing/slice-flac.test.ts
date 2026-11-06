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

  it('rejects a file without the marker', async () => {
    await expect(collect(sliceFlac, new Uint8Array(100), 50)).rejects.toThrow('marker');
  });
});
