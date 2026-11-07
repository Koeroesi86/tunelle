import { aacSampleRates } from './adts';
import { aacConfigOf, audioTrackOf, sampleTableOf } from './mp4-audio';
import type { AacConfig } from './mp4-audio';
import { boxAt, childOf, mustChild } from './mp4-boxes';
import type { Box } from './mp4-boxes';
import { defaultSizeOf, fragmentSamples, trackIdOf } from './mp4-fragments';
import type { Samples } from './mp4-fragments';
import { NotSliceable, SliceError, mustRead } from './types';
import type { ReadRange, Slicer } from './types';

/** The table of the samples of the track is read whole: 4 bytes of a sample, 22 ms of sound each, so a ten hour book is 7 MB of it */
const maxMovieBytes = 64 * 1024 * 1024;
const samplesOfFrame = 1024;
const adtsHeader = 7;
const maxFrame = 8191;
/** Pieces start this many samples early, which the decoder needs of the piece before */
const leadInSamples = 2;
/** Samples of one piece that lie further apart than this in the file are read apart, as the bytes between them belong to another track */
const maxGap = 256 * 1024;

/** The `moov` box of the file, read whole, as the boxes at the top of the file go one after the other */
const readMovie = async (read: ReadRange, size: number, offset = 0): Promise<{ bytes: Uint8Array; moov: Box; end: number }> => {
  if (offset >= size) throw new NotSliceable('An MP4 file without a moov box');
  const box = boxAt(await mustRead(read, offset, Math.min(offset + 16, size), 'A box of an MP4 file'), 0, size - offset);
  if (box.type === 'moof') throw new NotSliceable('An MP4 file in fragments with the moof box before the moov box');
  if (box.type !== 'moov') return readMovie(read, size, offset + box.end);
  if (box.end > maxMovieBytes) throw new NotSliceable('An MP4 file with a moov box of more than 64 MB');

  const bytes = await mustRead(read, offset, offset + box.end, 'The moov box of an MP4 file');
  return { bytes, moov: boxAt(bytes, 0), end: offset + box.end };
};

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The sizes of the samples: one size for all of them, or one each */
const sizesOf = (bytes: Uint8Array, box: Box) => {
  const data = view(bytes);
  const [size, count] = [data.getUint32(box.start + 4), data.getUint32(box.start + 8)];
  return Uint32Array.from({ length: count }, (_, index) => size || data.getUint32(box.start + 12 + index * 4));
};

/** The runs of chunks that have the same number of samples: the first chunk (from 1) and the samples of each */
const runsOf = (bytes: Uint8Array, box: Box) => {
  const data = view(bytes);
  return Array.from({ length: data.getUint32(box.start + 4) }, (_, index) => ({
    firstChunk: data.getUint32(box.start + 8 + index * 12),
    samplesPerChunk: data.getUint32(box.start + 12 + index * 12),
  }));
};

/** Where the chunks start in the file: 32 bits each in `stco`, 64 in `co64` */
const chunkOffsetsOf = (bytes: Uint8Array, box: Box) => {
  const data = view(bytes);
  const width = box.type === 'co64' ? 8 : 4;
  const offsetAt = (at: number) => (width === 8 ? data.getUint32(at) * 2 ** 32 + data.getUint32(at + 4) : data.getUint32(at));
  return Array.from({ length: data.getUint32(box.start + 4) }, (_, index) => offsetAt(box.start + 8 + index * width));
};

const fillChunk = (samples: Samples, first: number, count: number, offset: number) => {
  let at = offset;
  for (let index = first; index < first + count; index++) {
    samples.offsets[index] = at;
    at += samples.sizes[index];
  }
};

/** Where each sample is: the samples of a chunk follow each other from the start of the chunk */
const layoutOf = (sizes: Uint32Array, runs: { firstChunk: number; samplesPerChunk: number }[], chunks: number[]): Samples => {
  const samples = { offsets: new Float64Array(sizes.length), sizes };
  let [sample, run] = [0, 0];
  chunks.forEach((offset, chunk) => {
    run += runs[run + 1]?.firstChunk <= chunk + 1 ? 1 : 0;
    const count = Math.min(runs[run]?.samplesPerChunk ?? 0, sizes.length - sample);
    fillChunk(samples, sample, count, offset);
    sample += count;
  });
  if (sample !== sizes.length) throw new SliceError('An MP4 file whose chunks do not hold all its samples');
  return samples;
};

const checkedSizes = (samples: Samples) => {
  if (samples.sizes.some((size) => size + adtsHeader > maxFrame)) throw new NotSliceable('An MP4 file with a frame that does not fit an ADTS header');
  return samples;
};

const samplesOf = (bytes: Uint8Array, stbl: Box) => {
  const offsets = chunkOffsetsOf(bytes, childOf(bytes, stbl, 'stco') ?? mustChild(bytes, stbl, 'co64'));
  const sizes = sizesOf(bytes, mustChild(bytes, stbl, 'stsz'));
  return checkedSizes(layoutOf(sizes, runsOf(bytes, mustChild(bytes, stbl, 'stsc')), offsets));
};

/** The sample at which each piece starts, a piece taking samples until it has about `sliceBytes` of them, and the end */
const cutPoints = (sizes: Uint32Array, sliceBytes: number) => {
  const cuts = [0];
  let bytes = 0;
  sizes.forEach((size, index) => {
    bytes += size;
    if (bytes < sliceBytes) return;
    cuts.push(index + 1);
    bytes = 0;
  });
  return cuts[cuts.length - 1] === sizes.length ? cuts : [...cuts, sizes.length];
};

interface Span {
  first: number;
  end: number;
  start: number;
  stop: number;
}

/** The samples as reads of the file: the ones that lie next to each other, or nearly, are one */
const spansOf = ({ offsets, sizes }: Samples, from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => from + index).reduce<Span[]>((spans, index) => {
    const last = spans[spans.length - 1];
    const [start, stop] = [offsets[index], offsets[index] + sizes[index]];
    if (!last || start < last.stop || start - last.stop > maxGap) return [...spans, { first: index, end: index + 1, start, stop }];
    return [...spans.slice(0, -1), { ...last, end: index + 1, stop }];
  }, []);

/** The ADTS header of a frame of `size` bytes of AAC LC, with no CRC */
const headerOf = ({ sampleRateIndex, channels }: AacConfig, size: number) => {
  const length = size + adtsHeader;
  return [
    0xff,
    0xf1,
    (1 << 6) | (sampleRateIndex << 2) | (channels >> 2),
    ((channels & 3) << 6) | (length >> 11),
    (length >> 3) & 0xff,
    ((length & 7) << 5) | 0x1f,
    0xfc,
  ];
};

const writeFrames = (out: Uint8Array, at: number, bytes: Uint8Array, span: Span, samples: Samples, config: AacConfig) => {
  let position = at;
  for (let index = span.first; index < span.end; index++) {
    out.set(headerOf(config, samples.sizes[index]), position);
    const offset = samples.offsets[index] - span.start;
    out.set(bytes.subarray(offset, offset + samples.sizes[index]), position + adtsHeader);
    position += adtsHeader + samples.sizes[index];
  }
  return position;
};

/** The samples from one to another as the frames of an ADTS stream */
const framesOf = async (read: ReadRange, samples: Samples, config: AacConfig, from: number, to: number) => {
  const spans = spansOf(samples, from, to);
  const out = new Uint8Array(samples.sizes.subarray(from, to).reduce((total, size) => total + size + adtsHeader, 0));
  let at = 0;
  for (const span of spans) at = writeFrames(out, at, await mustRead(read, span.start, span.stop, 'The samples of an MP4 file'), span, samples, config);
  return out;
};

/**
 * An MP4 file with AAC is cut between two samples, which are given to the decoder as the frames of an ADTS stream: the file is not read for its
 * `mdat` as a whole and no piece needs the table of the samples. Each piece but the first starts two frames early, which are left out
 */
export const sliceMp4: Slicer = async function* (read, size, sliceBytes) {
  const { bytes, moov, end } = await readMovie(read, size);
  const track = audioTrackOf(bytes, moov);
  const stbl = sampleTableOf(bytes, track);
  const config = aacConfigOf(bytes, mustChild(bytes, stbl, 'stsd'));
  const isFragmented = childOf(bytes, moov, 'mvex') !== undefined;
  const samples = isFragmented
    ? checkedSizes(await fragmentSamples(read, size, end, trackIdOf(bytes, track), defaultSizeOf(bytes, moov, trackIdOf(bytes, track))))
    : samplesOf(bytes, stbl);
  const cuts = cutPoints(samples.sizes, sliceBytes);

  for (let index = 0; index < cuts.length - 1; index++) {
    const from = index === 0 ? 0 : Math.max(cuts[index] - leadInSamples, 0);
    yield {
      bytes: await framesOf(read, samples, config, from, cuts[index + 1]),
      skip: ((cuts[index] - from) * samplesOfFrame) / aacSampleRates[config.sampleRateIndex],
    };
  }
};
