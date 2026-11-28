import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { damaged } from '../../../shared/test-damaged-bytes';
import { propertyParameters } from '../../../shared/test-properties';
import { collect, join, memoryReader } from './memory-reader';
import { fragment, movie, sample } from './mp4-fixture';
import { aacStreamOf } from './mp4-audio';
import { sliceFlac } from './slice-flac';
import { eachSample, readMp4Track, sliceMp4 } from './slice-mp4';
import { sliceWav } from './slice-wav';
import { SliceError } from './types';
import type { ReadRange, Slicer } from './types';

const ascii = (text: string) => Uint8Array.from([...text].map((letter) => letter.charCodeAt(0)));
const le = (value: number, width: number) => Uint8Array.from({ length: width }, (_, index) => Math.floor(value / 256 ** index) % 256);

/** A reader that fails a parser that asks for a range that is none, or that does not stop asking */
const strictReader = (file: Uint8Array): ReadRange => {
  const read = memoryReader(file);
  let reads = 0;
  return async (start, end) => {
    reads += 1;
    if (reads > 10_000) throw new Error('The parser does not stop reading');
    if (!(start >= 0 && end >= start)) throw new Error(`The parser reads from ${start} to ${end}`);
    return read(start, end);
  };
};

const drain = async (pieces: AsyncGenerator<unknown>) => {
  for await (const piece of pieces) expect(piece).toBeDefined();
};

/** Resolves for a file that is read or refused, as the measurement of a file takes any other error for a fault of the app */
const readOrRefused = (reading: Promise<unknown>) =>
  reading.then(
    () => undefined,
    (error: unknown) => {
      if (!(error instanceof SliceError)) throw error;
    }
  );

const survives = (slicer: Slicer, files: fc.Arbitrary<Uint8Array>) =>
  fc.assert(
    fc.asyncProperty(files, fc.integer({ min: 1, max: 5000 }), (file, sliceBytes) => readOrRefused(drain(slicer(strictReader(file), file.length, sliceBytes)))),
    propertyParameters
  );

/** Any bytes behind the start that the format has */
const startingWith = (...start: Uint8Array[]) => fc.uint8Array({ maxLength: 600 }).map((rest) => join(...start, rest));

const format = join(ascii('fmt '), le(16, 4), le(1, 2), le(2, 2), le(44100, 4), le(176400, 4), le(4, 2), le(16, 2));
const dataSizes = (length: number) => join(ascii('ds64'), le(28, 4), le(0, 8), le(length, 8), le(0, 8), le(0, 4));
const wav = (sound: Uint8Array) => join(ascii('RIFF'), le(0, 4), ascii('WAVE'), format, ascii('data'), le(sound.length, 4), sound);
const rf64 = (sound: Uint8Array) =>
  join(ascii('RF64'), le(0xffffffff, 4), ascii('WAVE'), dataSizes(sound.length), format, ascii('data'), le(0xffffffff, 4), sound);

const someSound = Uint8Array.from({ length: 400 }, (_, index) => index % 251);

describe('sliceWav with untrusted bytes', () => {
  it('slices or refuses a damaged WAV or RF64 file', () => survives(sliceWav, fc.oneof(damaged(wav(someSound)), damaged(rf64(someSound)))));

  it('slices or refuses any bytes behind a WAV header', () => survives(sliceWav, startingWith(ascii('RIFF'), le(0, 4), ascii('WAVE'))));

  it('gives all the sound of a file, however it is cut', () =>
    fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 2000 }), fc.integer({ min: 1, max: 700 }), fc.constantFrom(wav, rf64), async (sound, sliceBytes, build) => {
        const slices = await collect(sliceWav, build(sound), sliceBytes);
        const headerLength = 12 + format.length + 8;

        expect(join(...slices.map(({ bytes }) => bytes.subarray(headerLength)))).toEqual(sound);
      }),
      propertyParameters
    ));
});

const crc8 = (bytes: number[]) =>
  bytes.reduce((crc, byte) => {
    let value = crc ^ byte;
    for (let bit = 0; bit < 8; bit++) value = value & 0x80 ? ((value << 1) ^ 0x07) & 0xff : (value << 1) & 0xff;
    return value;
  }, 0);

/** A frame of 4096 samples at 44.1 kHz in stereo and 16 bits, numbered `number` (under 128), whose sound holds no sync code */
const flacFrame = (length: number, number: number) => {
  const header = [0xff, 0xf8, 0xc9, 0x18, number];
  return Uint8Array.from([...header, crc8(header), ...new Array<number>(length - 6).fill(number)]);
};

const metadata = join(ascii('fLaC'), Uint8Array.from([0x80, 0, 0, 34]), new Uint8Array(34).fill(7));
const flacFrames = fc
  .array(fc.integer({ min: 70, max: 400 }), { minLength: 1, maxLength: 40 })
  .map((lengths) => lengths.map((length, number) => flacFrame(length, number)));

describe('sliceFlac with untrusted bytes', () => {
  const file = join(metadata, ...[80, 120, 200, 90, 300].map((length, number) => flacFrame(length, number)));

  it('slices or refuses a damaged file', () => survives(sliceFlac, damaged(file)));

  it('slices or refuses any bytes behind the marker', () => survives(sliceFlac, startingWith(ascii('fLaC'))));

  it('gives all the frames of a file, each piece with its metadata, however it is cut', () =>
    fc.assert(
      fc.asyncProperty(flacFrames, fc.integer({ min: 1, max: 2000 }), async (frames, sliceBytes) => {
        const slices = await collect(sliceFlac, join(metadata, ...frames), sliceBytes);

        slices.forEach(({ bytes }) => expect(bytes.subarray(0, metadata.length)).toEqual(metadata));
        expect(join(...slices.map(({ bytes }) => bytes.subarray(metadata.length)))).toEqual(join(...frames));
      }),
      propertyParameters
    ));
});

const sizes = [40, 60, 80, 20, 50];
const samples = sizes.map((size, index) => sample(index + 1, size));

/** An MP4 file with the sample table in front, then the samples */
const plainMp4 = (parts: Uint8Array[], perChunk: number, large: boolean) => {
  const layout = { sizes: parts.map((part) => part.length), perChunk, large };
  const length = movie({ ...layout, offsetOfFirstChunk: 0 }).length;
  return join(movie({ ...layout, offsetOfFirstChunk: length }), ...parts);
};

const fragmentedMp4 = (parts: Uint8Array[], perRun: number, defaultSize: boolean) =>
  join(movie({ sizes: [], perChunk: 1, offsetOfFirstChunk: 0, fragments: true }), fragment({ samples: parts, perRun, defaultSize }));

const mp4Files = fc.oneof(
  damaged(plainMp4(samples, 2, false)),
  damaged(plainMp4(samples, 5, true)),
  damaged(fragmentedMp4(samples, 2, false)),
  damaged(fragmentedMp4([sample(1, 30), sample(2, 30)], 2, true))
);

/** What the WebCodecs measurement does with a file: the track, its description and each sample */
const readSamples = async (file: Uint8Array) => {
  const read = strictReader(file);
  const track = await readMp4Track(read, file.length);
  aacStreamOf(track.bytes, track.description);
  await drain(eachSample(read, track.samples, 0, Math.min(track.samples.sizes.length, 20)));
};

describe('sliceMp4 with untrusted bytes', () => {
  it('slices or refuses a damaged file', () => survives(sliceMp4, mp4Files));

  it('slices or refuses any bytes behind the start of a box', () => survives(sliceMp4, startingWith(le(0, 4), ascii('moov'))));

  it('reads or refuses the track of a damaged file', () =>
    fc.assert(
      fc.asyncProperty(mp4Files, (file) => readOrRefused(readSamples(file))),
      propertyParameters
    ));

  it('gives each sample of a file, whole or in fragments', () =>
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 200 }), { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 1, max: 8 }),
        fc.boolean(),
        fc.constantFrom(plainMp4, fragmentedMp4),
        async (lengths, perPart, flag, build) => {
          const parts = lengths.map((length, index) => sample(index + 1, length));
          const file = build(parts, perPart, flag && build === plainMp4);
          const read = memoryReader(file);
          const track = await readMp4Track(read, file.length);
          const found: Uint8Array[] = [];
          for await (const one of eachSample(read, track.samples, 0, track.samples.sizes.length)) found.push(one);

          expect(found).toEqual(parts);
        }
      ),
      propertyParameters
    ));
});
