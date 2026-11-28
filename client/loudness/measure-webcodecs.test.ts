import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlockMeter } from './block-energies';
import { measureWebCodecs } from './measure-webcodecs';
import { box, description, esds, movie, sample } from './slicing/mp4-fixture';
import { join, memoryReader } from './slicing/memory-reader';
import { summarise } from './summarise';

/** The file that is read: `unreadable` says a range of it could not be fetched, `goneAfter` is the offset from which reading it throws */
const file = { bytes: new Uint8Array(0), unreadable: false, goneAfter: Infinity };
vi.mock('./measure-sliced', () => ({
  rangeReader: () => ({
    read: async (start: number, end: number) => {
      if (start >= file.goneAfter) throw new Error('gone');
      return memoryReader(file.bytes)(start, end);
    },
    size: async () => file.bytes.length,
    state: { unreadable: file.unreadable },
  }),
}));
vi.mock('./block-energies', () => ({ createBlockMeter: vi.fn() }));
vi.mock('./summarise', () => ({ summarise: vi.fn() }));

const summary = { analysis: { integratedLufs: -20 }, trackGain: 2, trackPeak: 0.5 };
const sizes = Array.from({ length: 50 }, (_, index) => 100 + index);
const ftyp = box('ftyp', Uint8Array.from([0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0]));
const mdat = box('mdat', ...sizes.map((size, index) => sample(index + 1, size)));
const mp4 = (entry = description('mp4a', esds(5))) => join(ftyp, mdat, movie({ sizes, perChunk: 10, offsetOfFirstChunk: ftyp.length + 8, entry }));

interface Fake {
  configured?: AudioDecoderConfig;
  chunks: { timestamp: number; first: number }[];
}
const fake: Fake = { chunks: [] };
const push = vi.fn(() => true);

/** A decoder that gives 1024 frames of two channels, at 44.1 kHz, for each chunk it is given, and closes without a word */
class FakeDecoder {
  static isConfigSupported = vi.fn(() => Promise.resolve({ supported: true }));
  state = 'configured';
  decodeQueueSize = 0;
  constructor(protected init: { output: (audio: unknown) => void; error: () => void }) {}
  configure = (config: AudioDecoderConfig) => {
    fake.configured = config;
  };
  decode = (chunk: { timestamp: number; first: number }) => {
    fake.chunks.push(chunk);
    this.init.output({ numberOfChannels: 2, numberOfFrames: 1024, sampleRate: 44100, copyTo: (to: Float32Array) => to.fill(0.1), close: () => undefined });
  };
  flush = () => Promise.resolve();
  close = () => undefined;
  addEventListener: (name: string, listener: () => void) => void = () => undefined;
}

beforeEach(() => {
  vi.resetAllMocks();
  fake.configured = undefined;
  fake.chunks = [];
  Object.assign(file, { bytes: mp4(), unreadable: false, goneAfter: Infinity });
  FakeDecoder.isConfigSupported = vi.fn(() => Promise.resolve({ supported: true }));
  vi.stubGlobal('AudioDecoder', FakeDecoder);
  vi.stubGlobal(
    'EncodedAudioChunk',
    class {
      timestamp: number;
      first: number;
      constructor({ timestamp, data }: { timestamp: number; data: Uint8Array }) {
        this.timestamp = timestamp;
        this.first = data[0];
      }
    }
  );
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      destination = {};
      createBuffer = () => ({ copyToChannel: () => undefined });
      createBufferSource = () => ({ connect: () => undefined, start: () => undefined });
      startRendering = () => Promise.resolve({ numberOfChannels: 2, getChannelData: () => new Float32Array(10) });
    }
  );
  vi.mocked(createBlockMeter).mockReturnValue({ push, finish: () => ({ energies: new Float64Array(1), peak: 0.5, channels: 2 }) });
  vi.mocked(summarise).mockReturnValue(summary as never);
});

describe('measureWebCodecs', () => {
  it('gives every sample of an HE-AAC track to the decoder, in order, with the config of the file', async () => {
    const result = await measureWebCodecs(1, 'url', vi.fn());

    expect(fake.configured).toMatchObject({ codec: 'mp4a.40.5', sampleRate: 44100, numberOfChannels: 2 });
    expect(fake.chunks.map(({ first }) => first)).toEqual(sizes.map((_, index) => index + 1));
    expect(fake.chunks[1].timestamp).toBe(Math.round((1024 * 1e6) / 44100));
    expect(result).toMatchObject({ id: 1, outcome: 'measured' });
  });

  it('resamples what the decoder gives to the rate of the measurement and measures it', async () => {
    await measureWebCodecs(1, 'url', vi.fn());

    expect(push).toHaveBeenCalledWith([expect.any(Float32Array), expect.any(Float32Array)]);
  });

  it('is undefined for a file that is not an MP4 or whose AAC the browser does not decode', async () => {
    FakeDecoder.isConfigSupported = vi.fn(() => Promise.resolve({ supported: false }));
    expect(await measureWebCodecs(1, 'url', vi.fn())).toBeUndefined();

    file.bytes = new Uint8Array(100).fill(1);
    expect(await measureWebCodecs(1, 'url', vi.fn())).toBeUndefined();
  });

  it('is undecodable when the decoder fails', async () => {
    vi.stubGlobal(
      'AudioDecoder',
      class extends FakeDecoder {
        decode = () => {
          throw new Error('closed');
        };
      }
    );

    expect(await measureWebCodecs(1, 'url', vi.fn())).toEqual({ id: 1, outcome: 'undecodable' });
  });

  it('measures sound that is at the rate of the measurement as it is', async () => {
    vi.stubGlobal(
      'AudioDecoder',
      class extends FakeDecoder {
        decode = () => this.init.output({ numberOfChannels: 2, numberOfFrames: 1024, sampleRate: 48_000, copyTo: () => undefined, close: () => undefined });
      }
    );
    vi.stubGlobal('OfflineAudioContext', undefined);

    await measureWebCodecs(1, 'url', vi.fn());

    expect(push).toHaveBeenCalledWith([new Float32Array(sizes.length * 1024), new Float32Array(sizes.length * 1024)]);
  });

  it('gives the decoder no more while its queue is full', async () => {
    const waited = vi.fn();
    vi.stubGlobal(
      'AudioDecoder',
      class extends FakeDecoder {
        decodeQueueSize = 100;
        addEventListener = (name: string, listener: () => void) => {
          waited(name, fake.chunks.length);
          this.decodeQueueSize = 0;
          listener();
        };
      }
    );

    await measureWebCodecs(1, 'url', vi.fn());

    expect(waited.mock.calls).toEqual([['dequeue', 0]]);
    expect(fake.chunks).toHaveLength(sizes.length);
  });

  it('is undefined for an MP4 that cannot be read as a track of samples', async () => {
    file.bytes = join(ftyp, mdat);

    expect(await measureWebCodecs(1, 'url', vi.fn())).toBeUndefined();
  });

  it('fails with an error of reading that says nothing about the file', async () => {
    file.goneAfter = ftyp.length;

    await expect(measureWebCodecs(1, 'url', vi.fn())).rejects.toThrow('gone');
  });

  it.each([
    ['undecodable', false],
    ['unreadable', true],
  ])('is %s when the decoder reports a failure, and does not close what it closed itself', async (outcome, unreadable) => {
    const close = vi.fn();
    file.unreadable = unreadable;
    vi.stubGlobal(
      'AudioDecoder',
      class extends FakeDecoder {
        close = close;
        decode = () => {
          this.state = 'closed';
          this.init.error();
        };
      }
    );

    expect(await measureWebCodecs(1, 'url', vi.fn())).toEqual({ id: 1, outcome });
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ['silent', false],
    ['unreadable', true],
  ])('is %s when nothing of the sound passes the gate', async (outcome, unreadable) => {
    file.unreadable = unreadable;
    vi.mocked(summarise).mockReturnValue(undefined);

    expect(await measureWebCodecs(1, 'url', vi.fn())).toEqual({ id: 1, outcome });
  });

  it('is silent when the decoder gives no sound', async () => {
    vi.stubGlobal(
      'AudioDecoder',
      class extends FakeDecoder {
        decode = () => undefined;
      }
    );

    expect(await measureWebCodecs(1, 'url', vi.fn())).toEqual({ id: 1, outcome: 'silent' });
    expect(createBlockMeter).not.toHaveBeenCalled();
  });
});
