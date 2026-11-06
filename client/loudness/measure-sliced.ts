import type { MeasureResult } from '@shared/types/loudness';
import { createBlockMeter } from './block-energies';
import { measurementRate } from './k-weighting';
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
const rangeReader = (url: string) => {
  const state = { unreadable: false };
  const fetchRange = (start: number, end: number) =>
    fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } }).then(
      (response) => (response.status === 206 ? response : undefined),
      () => undefined
    );

  const read: ReadRange = async (start, end) => {
    const response = await fetchRange(start, end);
    const bytes = await response?.arrayBuffer().then(
      (buffer) => new Uint8Array(buffer),
      () => undefined
    );
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

/**
 * The measurement of a file that is too long to be decoded as a whole: it is cut into pieces that are fetched, decoded and measured one after
 * the other, so only one is in memory. A format that is not cut is `too-large`. See docs/app/loudness-measurement.md
 */
export const measureSliced = async (id: number, url: string, duration: number | undefined, decode: Decode): Promise<MeasureResult> => {
  const { read, size, state } = rangeReader(url);
  const total = await size();
  const slicer = total === undefined ? undefined : await slicerOf(read);
  if (total === undefined || !slicer) return { id, outcome: state.unreadable ? 'unreadable' : 'too-large' };

  const sliceBytes = duration ? Math.min(Math.max(Math.ceil((total / duration) * sliceSeconds), minSliceBytes), maxSliceBytes) : unknownSliceBytes;
  let meter: ReturnType<typeof createBlockMeter> | undefined;
  try {
    for await (const slice of slicer(read, total, sliceBytes)) {
      const audio = await decode(toArrayBuffer(slice));
      if (!audio) return { id, outcome: state.unreadable ? 'unreadable' : 'undecodable' };
      meter ??= createBlockMeter(audio.numberOfChannels);
      if (!meter.push(withoutSkip(audio, slice.skip))) return { id, outcome: 'undecodable' };
    }
  } catch (error) {
    if (!(error instanceof SliceError)) throw error;
    return { id, outcome: state.unreadable ? 'unreadable' : 'undecodable' };
  }

  const summary = meter && summarise([meter.finish()]);
  return summary ? { id, outcome: 'measured', ...summary } : { id, outcome: state.unreadable ? 'unreadable' : 'silent' };
};
