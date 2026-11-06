import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlockMeter } from './block-energies';
import { measurementRate } from './k-weighting';
import { measureSliced } from './measure-sliced';
import { readBody } from './read-body';
import { slicerOf } from './slicing/slice-file';
import { NotSliceable, SliceError } from './slicing/types';
import type { ReadRange, Slice } from './slicing/types';
import { summarise } from './summarise';

// what measureSliced works with is replaced: the slicer of the format, the meter, the summary, the reading of a body and the fetch of the page
vi.mock('./slicing/slice-file', () => ({ slicerOf: vi.fn() }));
vi.mock('./block-energies', () => ({ createBlockMeter: vi.fn() }));
vi.mock('./summarise', () => ({ summarise: vi.fn() }));
vi.mock('./read-body', () => ({ readBody: vi.fn() }));

const url = 'tunelle://app/track?path=a';
const stats = { energies: new Float64Array(3), peak: 0.5, channels: 2 };
const summary = { analysis: { integratedLufs: -20 }, trackGain: 2, trackPeak: 0.5 };

type Pieces = (read: ReadRange) => AsyncGenerator<Slice>;

/** The slicer of the test gives these pieces, one after the other */
const slicing = (...slices: Slice[]) => {
  const slicer = vi.fn((_read: ReadRange, _size: number, _sliceBytes: number) =>
    (async function* () {
      yield* slices;
    })()
  );
  vi.mocked(slicerOf).mockResolvedValue(slicer);
  return slicer;
};

/** The slicer of the test runs what it is given: it can read, and it can fail */
const slicingWith = (pieces: Pieces) => vi.mocked(slicerOf).mockResolvedValue((read) => pieces(read));

const piece = (skip = 0, extra: Partial<Slice> = {}): Slice => ({ bytes: Uint8Array.of(1, 2, 3), skip, ...extra });

/** A decoded piece of two seconds in which each sample is its number, so what was left out of it shows */
const decoded = (channels = 2) => ({
  numberOfChannels: channels,
  getChannelData: () => Float32Array.from({ length: 2 * measurementRate }, (_, index) => index),
});

const answer = (total: number | undefined, status = 206) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(undefined, { status, headers: total === undefined ? {} : { 'Content-Range': `bytes 0-0/${total}` } }))
  );

type Decode = (bytes: ArrayBuffer) => Promise<ReturnType<typeof decoded> | undefined>;

interface Options {
  decode?: Decode;
  /** The length of the track in seconds, undefined when it is not known */
  duration?: number | undefined;
  progress?: () => void;
}

/** A duration that is not given is 1000 s, one that is given as undefined is a track of which the length is not known */
const measure = (options: Options = {}) =>
  measureSliced(1, url, 'duration' in options ? options.duration : 1000, options.decode ?? (async () => decoded()), options.progress ?? vi.fn());

describe('measureSliced', () => {
  const meter = { push: vi.fn<(channels: Float32Array[]) => boolean>(), finish: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    meter.push.mockReturnValue(true);
    meter.finish.mockReturnValue(stats);
    vi.mocked(createBlockMeter).mockReturnValue(meter);
    vi.mocked(summarise).mockReturnValue(summary as ReturnType<typeof summarise>);
    vi.mocked(readBody).mockResolvedValue(new Uint8Array(1));
    answer(3_800_000);
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('the pieces', () => {
    it('asks the size of the file with a range of one byte, and gives it to the slicer of the format with the reader of the ranges', async () => {
      const slicer = slicing(piece());

      await measure();

      expect(fetch).toHaveBeenNthCalledWith(1, url, { headers: { Range: 'bytes=0-0' } });
      expect(slicerOf).toHaveBeenCalledTimes(1);
      expect(slicer).toHaveBeenCalledWith(expect.any(Function), 3_800_000, expect.any(Number));
    });

    it.each([
      ['about 300 s of the file', 1000, 3_800_000, 1_140_000],
      ['at least 1 MiB, for a short file', 1000, 100_000, 1024 * 1024],
      ['at most 256 MiB, for a file that is dense', 1, 3_800_000_000, 256 * 1024 * 1024],
      ['16 MiB for a file of which the length is not known', undefined, 3_800_000, 16 * 1024 * 1024],
    ])('cuts %s', async (_, duration, total, expected) => {
      answer(total);
      const slicer = slicing(piece());

      await measure({ duration });

      expect(slicer).toHaveBeenCalledWith(expect.anything(), total, expected);
    });

    it('reads a range of the file as the answer to a request for its bytes, and tells the progress of the body', async () => {
      const progress = vi.fn();
      slicingWith(async function* (read) {
        await read(10, 20);
        yield piece();
      });

      await measure({ progress });

      expect(fetch).toHaveBeenLastCalledWith(url, { headers: { Range: 'bytes=10-19' } });
      expect(readBody).toHaveBeenCalledWith(expect.any(Response), progress);
    });
  });

  describe('the measurement', () => {
    it('decodes each piece from a copy of its bytes and measures them all with one meter of the channels of the first', async () => {
      slicing(piece(), piece(), piece());
      const decode = vi.fn<Decode>(async () => decoded(2));

      const result = await measure({ decode });

      expect(decode).toHaveBeenCalledTimes(3);
      expect(new Uint8Array(decode.mock.calls[0][0])).toEqual(Uint8Array.of(1, 2, 3));
      expect(createBlockMeter).toHaveBeenCalledExactlyOnceWith(2);
      expect(meter.push).toHaveBeenCalledTimes(3);
      expect(summarise).toHaveBeenCalledExactlyOnceWith([stats]);
      expect(result).toEqual({ id: 1, outcome: 'measured', ...summary });
    });

    it('tells the progress when each piece is measured', async () => {
      slicing(piece(), piece(), piece());
      const progress = vi.fn();

      await measure({ progress });

      expect(progress).toHaveBeenCalledTimes(3);
    });

    it('measures a piece without the start that only gave the decoder what it needed, as many seconds as the piece says', async () => {
      slicing(piece(1.5));

      await measure();

      const [channels] = meter.push.mock.calls[0];
      expect(channels).toHaveLength(2);
      expect(channels[0]).toHaveLength(0.5 * measurementRate);
      expect(channels[0][0]).toBe(1.5 * measurementRate);
    });

    it('measures the end of a piece that tells how much of its end to keep, whatever the decoder gave in front of it', async () => {
      slicing(piece(0, { keep: 0.5 }));

      await measure();

      const [channels] = meter.push.mock.calls[0];
      expect(channels[1]).toHaveLength(0.5 * measurementRate);
      expect(channels[1][0]).toBe(1.5 * measurementRate);
    });

    it('prefers what to keep over what to skip, and measures all of a piece that is shorter than what it keeps', async () => {
      slicing(piece(1, { keep: 10 }));

      await measure();

      expect(meter.push.mock.calls[0][0][0]).toHaveLength(2 * measurementRate);
    });
  });

  describe('what it is when it ends', () => {
    it('is too large for a format that has no slicer', async () => {
      vi.mocked(slicerOf).mockResolvedValue(undefined);

      expect(await measure()).toEqual({ id: 1, outcome: 'too-large' });
    });

    it('is too large when the slicer says the variant of its format is not cut', async () => {
      slicingWith(async function* () {
        yield* [];
        throw new NotSliceable('an Ogg file of FLAC');
      });

      expect(await measure()).toEqual({ id: 1, outcome: 'too-large' });
    });

    it('is undecodable when the slicer says the file is not what its header says', async () => {
      slicingWith(async function* () {
        yield* [];
        throw new SliceError('no frame');
      });

      expect(await measure()).toEqual({ id: 1, outcome: 'undecodable' });
    });

    it('does not hide an error that is not the one of the slicer', async () => {
      slicingWith(async function* () {
        yield* [];
        throw new RangeError('a bug');
      });

      await expect(measure()).rejects.toThrow('a bug');
    });

    it('is unreadable when the file cannot be fetched', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      expect(await measure()).toEqual({ id: 1, outcome: 'unreadable' });
      expect(slicerOf).not.toHaveBeenCalled();
    });

    it.each([
      ['the answer is not a range', () => answer(3_800_000, 200)],
      ['the answer does not tell the size', () => answer(undefined)],
    ])('is unreadable when %s', async (_, setUp) => {
      setUp();

      expect(await measure()).toEqual({ id: 1, outcome: 'unreadable' });
    });

    it('is unreadable when a range was read badly, even if the slicer then fails', async () => {
      vi.mocked(readBody).mockResolvedValue(undefined);
      slicingWith(async function* (read) {
        await read(0, 10);
        throw new SliceError('could not be read');
      });

      expect(await measure()).toEqual({ id: 1, outcome: 'unreadable' });
    });

    it('is undecodable when a piece cannot be decoded, and goes no further', async () => {
      const slicer = slicing(piece(), piece());
      const decode = vi.fn<Decode>(async () => undefined);

      expect(await measure({ decode })).toEqual({ id: 1, outcome: 'undecodable' });
      expect(decode).toHaveBeenCalledTimes(1);
      expect(slicer).toHaveBeenCalledTimes(1);
    });

    it('is undecodable when the meter leaves a piece out, as it has another number of channels than the file', async () => {
      slicing(piece(), piece());
      meter.push.mockReturnValueOnce(true).mockReturnValueOnce(false);

      expect(await measure()).toEqual({ id: 1, outcome: 'undecodable' });
      expect(summarise).not.toHaveBeenCalled();
    });

    it.each([
      ['a file without a piece', [] as Slice[]],
      ['a file without a block above the gate', [piece()]],
    ])('is silent for %s', async (_, slices) => {
      slicing(...slices);
      vi.mocked(summarise).mockReturnValue(undefined);

      expect(await measure()).toEqual({ id: 1, outcome: 'silent' });
    });
  });
});
