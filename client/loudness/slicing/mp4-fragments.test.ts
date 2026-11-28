import { describe, expect, it } from 'vitest';
import { boxAt } from './mp4-boxes';
import { fragmentSamples, trackIdOf } from './mp4-fragments';
import { join, memoryReader } from './memory-reader';
import { box } from './mp4-fixture';

const words = (...values: number[]) => {
  const bytes = new Uint8Array(values.length * 4);
  values.forEach((value, index) => new DataView(bytes.buffer).setUint32(index * 4, value));
  return bytes;
};
/** A box that starts with its version and flags */
const full = (type: string, flags: number, ...values: number[]) => box(type, words(flags, ...values));
const moof = (header: Uint8Array, ...runs: Uint8Array[]) => box('moof', box('traf', header, ...runs));

const samplesOf = (file: Uint8Array) => fragmentSamples(memoryReader(file), file.length, 0, 1, 7);

describe('trackIdOf', () => {
  it.each([
    ['times of 4 bytes', 0, [0, 0, 5]],
    ['times of 8 bytes', 1, [0, 0, 0, 0, 5]],
  ])('reads the number of a track behind %s', (_, version, values) => {
    const bytes = box('trak', full('tkhd', version << 24, ...values));

    expect(trackIdOf(bytes, boxAt(bytes, 0))).toBe(5);
  });
});

describe('fragmentSamples', () => {
  it('finds the size behind every field that the header of a fragment can have, and counts from the base offset of 64 bits', async () => {
    // 0x01: a base offset of 8 bytes; 0x02: a description; 0x08: a duration; 0x10: the size of the samples
    const header = full('tfhd', 0x1b, 1, 1, 100, 9, 1024, 50);
    const file = moof(header, full('trun', 0x01, 2, 8));

    const { offsets, sizes } = await samplesOf(file);

    expect(Array.from(offsets)).toEqual([2 ** 32 + 108, 2 ** 32 + 158]);
    expect(Array.from(sizes)).toEqual([50, 50]);
  });

  it('finds the size of each sample among all the fields that a run can have', async () => {
    // 0x01: the offset of the data; 0x04: the flags of the first sample; 0x100 to 0x800: duration, size, flags and time of each sample
    const run = full('trun', 0xf05, 2, 40, 0, 1024, 11, 0, 0, 1024, 22, 0, 0);

    const { offsets, sizes } = await samplesOf(moof(full('tfhd', 0, 1), run));

    expect(Array.from(offsets)).toEqual([40, 51]);
    expect(Array.from(sizes)).toEqual([11, 22]);
  });

  it('goes on where the run before ended when a run says no offset, from the start of the moof for the first', async () => {
    const run = full('trun', 0x200, 2, 10, 20);

    const { offsets } = await samplesOf(moof(full('tfhd', 0, 1), run, run));

    expect(Array.from(offsets)).toEqual([0, 10, 30, 40]);
  });

  it('reads the whole of a moof box that is longer than what is read of each box first', async () => {
    const count = 20_000;
    const file = moof(full('tfhd', 0, 1), full('trun', 0x200, count, ...Array.from({ length: count }, () => 3)));

    expect((await samplesOf(file)).sizes).toHaveLength(count);
  });

  it('refuses a moof box of more than 16 MB without reading it', async () => {
    const head = new Uint8Array(64 * 1024);
    head.set(join(words(17 * 1024 * 1024), box('moof').subarray(4)));

    await expect(fragmentSamples(memoryReader(head), 32 * 1024 * 1024, 0, 1, 7)).rejects.toThrow('more than 16 MB');
  });
});
