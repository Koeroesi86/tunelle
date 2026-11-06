import { describe, expect, it } from 'vitest';
import { sliceOgg } from './slice-ogg';
import { collect, join } from './memory-reader';
import { opusHead, page, vorbisIdentification } from './ogg-fixture';

/** An Opus stream: two header pages, then pages of 960 samples (20 ms) each with a body of `length` bytes */
const opus = (pages: number, length = 300, serial = 7) =>
  join(
    page(serial, 0, 0, opusHead, 0x02),
    page(serial, 1, 0, new Uint8Array(40).fill(9)),
    ...Array.from({ length: pages }, (_, index) => page(serial, 2 + index, 960 * (index + 1), new Uint8Array(length).fill(1 + (index % 200))))
  );

const pageBytes = 27 + 2 + 300;

describe('sliceOgg', () => {
  const file = opus(400);
  const headerBytes = file.length - 400 * pageBytes;

  it('cuts at the start of a page, with the pages of the header of the file in front of each piece', async () => {
    const slices = await collect(sliceOgg, file, 20_000);

    expect(slices.length).toBeGreaterThan(4);
    slices.forEach(({ bytes }) => expect(bytes.subarray(0, headerBytes)).toEqual(file.subarray(0, headerBytes)));
    slices.forEach(({ bytes }) => expect(String.fromCharCode(...bytes.subarray(headerBytes, headerBytes + 4))).toBe('OggS'));
  });

  it('keeps as much of the end of a piece as it adds to the sound, by the positions of the pages', async () => {
    const slices = await collect(sliceOgg, file, 20_000);

    expect(slices[0].skip).toBe(0);
    expect(slices[0].keep).toBeUndefined();
    // 400 pages of 20 ms: what the first piece gives, and what each of the others adds, make the 8 s of the file
    const first = ((slices[0].bytes.length - headerBytes) / pageBytes) * 0.02;
    expect(first + slices.slice(1).reduce((total, { keep = 0 }) => total + keep, 0)).toBeCloseTo(8, 6);
  });

  it('gives every page to the pieces once, and the last ones before a cut again at the start of the next', async () => {
    const slices = await collect(sliceOgg, file, 20_000);

    const total = slices.reduce((sum, { bytes }) => sum + bytes.length - headerBytes, 0);

    expect(total).toBeGreaterThan(400 * pageBytes);
    // 32 KB of pages before each cut, and at most one page more
    expect(total).toBeLessThanOrEqual(400 * pageBytes + (slices.length - 1) * (32_768 + pageBytes));
  });

  it('counts the sound in seconds of the rate of the file for Vorbis', async () => {
    const bodyBytes = 27 + 2 + 400;
    const vorbis = join(
      page(5, 0, 0, vorbisIdentification, 0x02),
      page(5, 1, 0, new Uint8Array(60).fill(3)),
      ...Array.from({ length: 300 }, (_, index) => page(5, 2 + index, 2048 * (index + 1), new Uint8Array(400).fill(4)))
    );
    const header = vorbis.length - 300 * bodyBytes;
    const slices = await collect(sliceOgg, vorbis, 30_000);

    const first = ((slices[0].bytes.length - header) / bodyBytes) * (2048 / 44100);
    expect(first + slices.slice(1).reduce((total, { keep = 0 }) => total + keep, 0)).toBeCloseTo((300 * 2048) / 44100, 6);
  });

  it('does not cut the stream of another codec, or a file of more than one stream', async () => {
    const flac = join(page(1, 0, 0, Uint8Array.from([0x7f, 0x46, 0x4c, 0x41, 0x43, 0, 0, 0]), 0x02), page(1, 1, 100, new Uint8Array(50)));
    const video = join(
      page(9, 0, 0, opusHead, 0x02),
      page(8, 0, 0, Uint8Array.from([0x80, 0x74, 0x68, 0x65, 0x6f, 0x72, 0x61]), 0x02),
      page(9, 1, 960, new Uint8Array(50))
    );

    await expect(collect(sliceOgg, flac, 1000)).rejects.toThrow('not Vorbis or Opus');
    await expect(collect(sliceOgg, video, 1000)).rejects.toThrow('more than one stream');
  });

  it('rejects what does not start with the first page of a stream', async () => {
    await expect(collect(sliceOgg, new Uint8Array(3000).fill(1), 1000)).rejects.toThrow('not one');
    await expect(collect(sliceOgg, opus(5).subarray(pageBytes - 300 + 40), 1000)).rejects.toThrow();
  });
});
