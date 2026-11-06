import { describe, expect, it } from 'vitest';
import { sliceAdts } from './slice-adts';
import { collect, join } from './memory-reader';

/** An ADTS frame of AAC LC at 44.1 kHz in stereo, `length` bytes with its header of 7, of one block of 1024 samples */
const frame = (marker: number, length = 200) => {
  const header = [0xff, 0xf1, (1 << 6) | (4 << 2), (2 << 6) | (length >> 11), (length >> 3) & 0xff, ((length & 7) << 5) | 0x1f, 0xfc];
  return Uint8Array.from([...header, ...new Array(length - 7).fill(marker)]);
};

const tag = (length: number) => join(Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, (length >> 7) & 127, length & 127]), new Uint8Array(length).fill(0xff));

describe('sliceAdts', () => {
  const stream = join(...Array.from({ length: 300 }, (_, index) => frame(index % 200, 180 + (index % 5) * 10)));

  it('cuts at the start of a frame, and starts each piece after the first a few frames early', async () => {
    const slices = await collect(sliceAdts, stream, 15_000);

    expect(slices.length).toBeGreaterThan(3);
    expect(slices[0].skip).toBe(0);
    slices.forEach(({ bytes }) => expect(bytes.subarray(0, 2)).toEqual(Uint8Array.from([0xff, 0xf1])));
    slices.slice(1).forEach(({ skip }) => {
      // two frames of 1024 samples at 44.1 kHz at least, which the bytes before the cut give, and not more than the 3000 that are looked at
      expect(skip).toBeGreaterThanOrEqual((2 * 1024) / 44100 - 1e-9);
      expect(skip).toBeLessThan(0.7);
    });
  });

  it('plays every frame once once what is left out is taken away', async () => {
    const slices = await collect(sliceAdts, stream, 15_000);

    const frames = slices.reduce((total, { bytes, skip }) => total + (bytes.length / 200) * (1024 / 44100) - skip, 0);

    expect(frames).toBeCloseTo((stream.length / 200) * (1024 / 44100), 0);
    expect(slices.reduce((total, { bytes }) => total + bytes.length, 0)).toBeGreaterThanOrEqual(stream.length);
  });

  it('starts at the first frame after a tag', async () => {
    const slices = await collect(sliceAdts, join(tag(5000), stream), 100_000);

    expect(slices[0].bytes.subarray(0, 2)).toEqual(Uint8Array.from([0xff, 0xf1]));
    expect(slices[0].bytes.length).toBeLessThanOrEqual(stream.length);
  });

  it('rejects a file with no frame', async () => {
    await expect(collect(sliceAdts, new Uint8Array(5000).fill(1), 1000)).rejects.toThrow('without a frame');
  });
});
