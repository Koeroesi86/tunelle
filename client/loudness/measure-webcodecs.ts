import type { MeasureResult } from '@shared/types/loudness';
import { createBlockMeter } from './block-energies';
import { measurementRate } from './k-weighting';
import { rangeReader } from './measure-sliced';
import { aacStreamOf } from './slicing/mp4-audio';
import { slicerOf } from './slicing/slice-file';
import { eachSample, readMp4Track, sliceMp4 } from './slicing/slice-mp4';
import { SliceError } from './slicing/types';
import type { ReadRange } from './slicing/types';
import { summarise } from './summarise';

/** The samples of AAC that are given to the decoder before the page looks at what it gave back */
const batchSamples = 2000;
/** The decoder is given this many chunks at most before it has taken some */
const maxQueued = 64;
/** What the decoder gave is resampled to the rate of the measurement and measured in parts of this many seconds, so only one part of the sound is in memory */
const partSeconds = 30;
const samplesPerFrame = 1024;

type Plane = Float32Array<ArrayBuffer>;
type Meter = ReturnType<typeof createBlockMeter>;

interface State {
  pending: Plane[][];
  frames: number;
  rate: number;
  meter: Meter | undefined;
  /** The decoder said it failed, or what it gave does not fit the rest of the file */
  failed: boolean;
}

const planesOf = (audio: AudioData) =>
  Array.from({ length: audio.numberOfChannels }, (_, channel) => {
    const samples = new Float32Array(audio.numberOfFrames);
    audio.copyTo(samples, { planeIndex: channel, format: 'f32-planar' });
    return samples;
  });

/** The sound of the decoder at the rate of the measurement, as `decodeAudioData` gives it: the context only resamples, it opens no audio device */
const resample = async (channels: Plane[], rate: number) => {
  if (rate === measurementRate) return channels;
  const length = channels[0].length;
  const context = new OfflineAudioContext(channels.length, Math.max(Math.round((length * measurementRate) / rate), 1), measurementRate);
  const buffer = context.createBuffer(channels.length, length, rate);
  channels.forEach((samples, channel) => buffer.copyToChannel(samples, channel));
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return Array.from({ length: rendered.numberOfChannels }, (_, channel) => rendered.getChannelData(channel));
};

const joined = (state: State) =>
  Array.from({ length: state.pending[0].length }, (_, channel) => {
    const samples = new Float32Array(state.frames);
    state.pending.reduce((offset, part) => {
      samples.set(part[channel], offset);
      return offset + part[channel].length;
    }, 0);
    return samples;
  });

/** Measures what the decoder gave when it is enough for a part, or when `force` says it is all */
const drain = async (state: State, force: boolean) => {
  if (state.frames === 0 || (!force && state.frames < state.rate * partSeconds)) return;
  const channels = await resample(joined(state), state.rate);
  state.meter ??= createBlockMeter(channels.length);
  state.failed ||= !state.meter.push(channels);
  state.pending = [];
  state.frames = 0;
};

const roomIn = (decoder: AudioDecoder) =>
  decoder.decodeQueueSize <= maxQueued
    ? Promise.resolve()
    : new Promise<void>((resolve) => decoder.addEventListener('dequeue', () => resolve(), { once: true }));

const decodeBatch = async (decoder: AudioDecoder, read: ReadRange, samples: Parameters<typeof eachSample>[1], from: number, to: number, rate: number) => {
  let index = from;
  for await (const data of eachSample(read, samples, from, to)) {
    await roomIn(decoder);
    decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round((index * samplesPerFrame * 1e6) / rate), data }));
    index += 1;
  }
};

/**
 * The measurement of a file in an MP4 container with AAC that the slicers do not cut (HE-AAC, AAC that is not low complexity, a frame that does not fit an
 * ADTS header): the samples are given to a WebCodecs `AudioDecoder` one by one, so no piece of the file is held whole. Undefined for a file this does not
 * cover, or whose AAC the browser does not decode. See docs/app/loudness-measurement.md
 */
export const measureWebCodecs = async (id: number, url: string, progress: () => void): Promise<MeasureResult | undefined> => {
  const { read, size, state: reading } = rangeReader(url, progress);
  const total = await size();
  if (total === undefined || (await slicerOf(read)) !== sliceMp4) return undefined;

  const track = await readMp4Track(read, total).then(
    (found) => ({ ...found, stream: aacStreamOf(found.bytes, found.description) }),
    (error: unknown) => {
      if (error instanceof SliceError) return undefined;
      throw error;
    }
  );
  if (!track) return undefined;

  const { stream, samples } = track;
  const config = { codec: `mp4a.40.${stream.objectType}`, sampleRate: stream.sampleRate, numberOfChannels: stream.channels, description: stream.description };
  if (!(await AudioDecoder.isConfigSupported(config)).supported) return undefined;

  const state: State = { pending: [], frames: 0, rate: stream.sampleRate, meter: undefined, failed: false };
  const decoder = new AudioDecoder({
    output: (audio) => {
      state.pending.push(planesOf(audio));
      state.frames += audio.numberOfFrames;
      state.rate = audio.sampleRate;
      audio.close();
    },
    error: () => {
      state.failed = true;
    },
  });
  decoder.configure(config);

  const run = async () => {
    for (let from = 0; from < samples.sizes.length && !state.failed; from += batchSamples) {
      await decodeBatch(decoder, read, samples, from, Math.min(from + batchSamples, samples.sizes.length), stream.sampleRate);
      await drain(state, false);
      progress();
    }
    await decoder.flush();
    await drain(state, true);
  };
  await run().catch(() => {
    state.failed = true;
  });
  if (decoder.state !== 'closed') decoder.close();

  if (state.failed) return { id, outcome: reading.unreadable ? 'unreadable' : 'undecodable' };
  const summary = state.meter && summarise([state.meter.finish()]);
  return summary ? { id, outcome: 'measured', ...summary } : { id, outcome: reading.unreadable ? 'unreadable' : 'silent' };
};
