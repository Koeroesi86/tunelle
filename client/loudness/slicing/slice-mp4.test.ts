import { describe, expect, it } from 'vitest';
import { sliceMp4 } from './slice-mp4';
import { collect, join } from './memory-reader';
import { box, description, esds, movie, sample } from './mp4-fixture';

const sizes = Array.from({ length: 600 }, (_, index) => 100 + (index % 7) * 10);
const samples = sizes.map((size, index) => sample(1 + (index % 200), size));
const ftyp = box('ftyp', Uint8Array.from([0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0]));
const mdat = box('mdat', ...samples);
const mdatStart = ftyp.length + 8;

/** A file with the movie at its end, as an encoder that writes the file in one go leaves it */
const movieLast = (options: Partial<Parameters<typeof movie>[0]> = {}) =>
  join(ftyp, mdat, movie({ sizes, perChunk: 40, offsetOfFirstChunk: mdatStart, ...options }));

/** The size of the frame an ADTS header at `offset` tells, which is the sample and its 7 bytes */
const frameLength = (bytes: Uint8Array, offset: number) => ((bytes[offset + 3] & 3) << 11) | (bytes[offset + 4] << 3) | (bytes[offset + 5] >> 5);

/** The frames of an ADTS stream: the marker of the sample in each */
const markers = (bytes: Uint8Array, offset = 0): number[] =>
  offset >= bytes.length ? [] : [bytes[offset + 7], ...markers(bytes, offset + frameLength(bytes, offset))];

describe('sliceMp4', () => {
  it('gives the samples as the frames of an ADTS stream, with the header of AAC LC at 44.1 kHz in stereo', async () => {
    const [first] = await collect(sliceMp4, movieLast(), 10_000);

    expect(Array.from(first.bytes.subarray(0, 7))).toEqual([0xff, 0xf1, 0x50, 0x80, ((100 + 7) >> 3) & 0xff, (((100 + 7) & 7) << 5) | 0x1f, 0xfc]);
    expect(first.bytes.subarray(7, 107)).toEqual(samples[0]);
  });

  it('cuts between two samples, starts each piece after the first two frames early, and leaves those out', async () => {
    const slices = await collect(sliceMp4, movieLast(), 10_000);

    expect(slices.length).toBeGreaterThan(5);
    expect(slices[0].skip).toBe(0);
    slices.slice(1).forEach(({ skip }) => expect(skip).toBeCloseTo((2 * 1024) / 44100, 9));
    // every sample once once the two frames at the start of a piece are left out, and in the order of the file
    const all = slices.flatMap(({ bytes, skip }, index) => markers(bytes).slice(index === 0 ? 0 : Math.round((skip * 44100) / 1024)));
    expect(all).toEqual(samples.map((_, index) => 1 + (index % 200)));
  });

  it('reads a file with the movie in front, and the offsets of a large file (co64)', async () => {
    const options = { sizes, perChunk: 25, large: true };
    const body = join(ftyp, movie({ ...options, offsetOfFirstChunk: 0 }), mdat);
    const front = join(ftyp, movie({ ...options, offsetOfFirstChunk: body.length - mdat.length + 8 }), mdat);

    const slices = await collect(sliceMp4, front, 10_000);

    expect(slices.flatMap(({ bytes, skip }, index) => markers(bytes).slice(index === 0 ? 0 : Math.round((skip * 44100) / 1024)))).toHaveLength(600);
  });

  it('reads the chunks apart where bytes of another track lie between them, and not those bytes', async () => {
    const gap = 300_000;
    const few = samples.slice(0, 200);
    const interleaved = box('mdat', ...few.flatMap((one, index) => (index % 40 === 39 ? [one, new Uint8Array(gap).fill(255)] : [one])));
    const file = join(ftyp, interleaved, movie({ sizes: sizes.slice(0, 200), perChunk: 40, offsetOfFirstChunk: mdatStart, gap }));

    const slices = await collect(sliceMp4, file, 10_000);

    // a piece is the frames it was cut from and nothing of the gaps, which are more than the slicer reads across
    expect(Math.max(...slices.map(({ bytes }) => bytes.length))).toBeLessThan(20_000);
    const all = slices.flatMap(({ bytes, skip }, index) => markers(bytes).slice(index === 0 ? 0 : Math.round((skip * 44100) / 1024)));
    expect(all).toEqual(few.map((_, index) => 1 + (index % 200)));
  });

  it.each([
    ['a file with fragments after the header', join(ftyp, box('moof', new Uint8Array(8)), mdat)],
    ['a file without a movie', join(ftyp, mdat)],
    ['a file whose movie says it is in fragments', movieLast({ fragments: true })],
    ['a file without sound', movieLast({ handler: 'vide' })],
    ['a file of Apple Lossless', movieLast({ entry: description('alac', new Uint8Array(24)) })],
    ['AAC with SBR (HE-AAC), which an ADTS stream cannot say', movieLast({ entry: description('mp4a', esds(5)) })],
    ['a codec that is not MPEG-4 AAC', movieLast({ entry: description('mp4a', esds(2, 0x6b)) })],
  ])('does not cut %s', async (_, file) => {
    await expect(collect(sliceMp4, file, 10_000)).rejects.toThrow();
  });

  it('does not cut a file with a frame that an ADTS header cannot say', async () => {
    const huge = movieLast({ sizes: [9000, 100] });

    await expect(collect(sliceMp4, huge, 10_000)).rejects.toThrow('ADTS header');
  });
});
