import { describe, expect, it } from 'vitest';
import { sliceMp3 } from './slice-mp3';
import { collect, join } from './memory-reader';

/** MPEG 1 Layer III at 128 kbit/s and 44.1 kHz: frames of 417 bytes (418 with padding) of 1152 samples */
const frame = (marker: number, padded = false) =>
  Uint8Array.from({ length: padded ? 418 : 417 }, (_, index) => (index === 0 ? 0xff : ([0, 0xfb, padded ? 0x92 : 0x90, 0][index] ?? marker)));

const frames = (count: number) => Array.from({ length: count }, (_, index) => frame(index % 200, index % 3 === 0));
const tag = (length: number) => join(Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, (length >> 7) & 127, length & 127]), new Uint8Array(length).fill(0xff));

describe('sliceMp3', () => {
  const stream = join(...frames(200));

  it('cuts at the start of a frame, and starts each piece after the first a few frames early', async () => {
    const slices = await collect(sliceMp3, stream, 20_000);

    expect(slices.length).toBeGreaterThan(3);
    expect(slices[0].bytes.subarray(0, 4)).toEqual(Uint8Array.from([0xff, 0xfb, 0x92, 0]));
    expect(slices[0].skip).toBe(0);
    slices.slice(1).forEach(({ bytes, skip }) => {
      expect(bytes[0]).toBe(0xff);
      // at least two frames of 1152 samples at 44.1 kHz, the bytes before the cut are about seven
      expect(skip).toBeGreaterThanOrEqual((2 * 1152) / 44100 - 1e-9);
      expect(skip).toBeLessThan(0.25);
    });
  });

  it('plays every frame once once what is left out is taken away', async () => {
    const slices = await collect(sliceMp3, stream, 20_000);

    const seconds = slices.reduce((total, { bytes, skip }) => total + ((bytes.length / 417.5) * 1152) / 44100 - skip, 0);

    expect(seconds).toBeCloseTo((200 * 1152) / 44100, 1);
  });

  it('starts at the first frame after a tag', async () => {
    const slices = await collect(sliceMp3, join(tag(5000), stream), 100_000);

    expect(slices[0].bytes.subarray(0, 4)).toEqual(Uint8Array.from([0xff, 0xfb, 0x92, 0]));
  });

  it('rejects a file with no frame', async () => {
    await expect(collect(sliceMp3, new Uint8Array(5000).fill(1), 1000)).rejects.toThrow('without a frame');
  });
});
