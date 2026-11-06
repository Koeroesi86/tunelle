import type { MeasureResult } from '@shared/types/loudness';
import { createBlockMeter } from './block-energies';
import { measurementRate } from './k-weighting';
import { readBody } from './read-body';
import { slicerOf } from './slicing/slice-file';
import { SliceError } from './slicing/types';
import type { ReadRange, Slice } from './slicing/types';
import { summarise } from './summarise';

/** A piece is about this long, so the decoded sound of it is 115 MB for stereo, however long the file is */
const sliceSeconds = 300;
const minSliceBytes = 1024 * 1024;
const maxSliceBytes = 256 * 1024 * 1024;
/** The pieces of a file of which the length is not known */
const unknownSliceBytes = 16 * 1024 * 1024;

/** What a decoder gives of a piece: an `AudioBuffer` has it */
interface Decoded {
  numberOfChannels: number;
  getChannelData: (channel: number) => Float32Array;
}

type Decode = (bytes: ArrayBuffer) => Promise<Decoded | undefined>;

/** The ranges of a track of the main process: its size comes from the first answer, as a range of one byte tells the size of the file */
const rangeReader = (url: string, progress: () => void) => {
  const state = { unreadable: false };
  const fetchRange = (start: number, end: number) =>
    fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } }).then(
      (response) => (response.status === 206 ? response : undefined),
      () => undefined
    );

  const read: ReadRange = async (start, end) => {
    const response = await fetchRange(start, end);
    const bytes = response && (await readBody(response, progress));
    state.unreadable ||= bytes === undefined;
    return bytes;
  };
  const size = async () => {
    const total = (await fetchRange(0, 1))?.headers.get('Content-Range')?.match(/\/(\d+)$/)?.[1];
    state.unreadable ||= total === undefined;
    return total === undefined ? undefined : Number(total);
  };
  return { read, size, state };
};

/** The samples of a decoded piece without its start, which only gave the decoder what it needed of the piece before */
const withoutSkip = (audio: Decoded, skip: number) =>
  Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel).subarray(Math.round(skip * measurementRate)));

// a copy, as decoding takes the buffer it is given
const toArrayBuffer = ({ bytes }: Slice) => new Uint8Array(bytes).buffer;

type Meter = ReturnType<typeof createBlockMeter>;

/** A piece that cannot be decoded or measured with the others, or a file that is not what its header says */
const failed = 'undecodable';

/** Decodes and measures the pieces one after the other; undefined for a file with none */
const measurePieces = async (
  pieces: AsyncGenerator<Slice>,
  decode: Decode,
  progress: () => void,
  meter?: Meter
): Promise<Meter | typeof failed | undefined> => {
  const { done, value } = await pieces.next();
  if (done) return meter;

  const audio = await decode(toArrayBuffer(value));
  const current = audio && (meter ?? createBlockMeter(audio.numberOfChannels));
  const measured = audio && current?.push(withoutSkip(audio, value.skip));
  progress();
  return measured ? measurePieces(pieces, decode, progress, current) : failed;
};

const toFailure = (error: unknown): typeof failed => {
  if (error instanceof SliceError) return failed;
  throw error;
};

/**
 * The measurement of a file that is too long to be decoded as a whole: it is cut into pieces that are fetched, decoded and measured one after
 * the other, so only one is in memory. A format that is not cut is `too-large`. See docs/app/loudness-measurement.md
 */
export const measureSliced = async (id: number, url: string, duration: number | undefined, decode: Decode, progress: () => void): Promise<MeasureResult> => {
  const { read, size, state } = rangeReader(url, progress);
  const total = await size();
  const slicer = total === undefined ? undefined : await slicerOf(read);
  if (total === undefined || !slicer) return { id, outcome: state.unreadable ? 'unreadable' : 'too-large' };

  const sliceBytes = duration ? Math.min(Math.max(Math.ceil((total / duration) * sliceSeconds), minSliceBytes), maxSliceBytes) : unknownSliceBytes;
  const meter = await measurePieces(slicer(read, total, sliceBytes), decode, progress).catch(toFailure);
  if (meter === failed) return { id, outcome: state.unreadable ? 'unreadable' : failed };

  const summary = meter && summarise([meter.finish()]);
  return summary ? { id, outcome: 'measured', ...summary } : { id, outcome: state.unreadable ? 'unreadable' : 'silent' };
};
