import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureBlocks } from './block-energies';
import { measurementRate } from './k-weighting';
import { measureSliced } from './measure-sliced';
import { page } from './slicing/ogg-fixture';
import { summarise } from './summarise';

const ascii = (text: string) => [...text].map((letter) => letter.charCodeAt(0));
const u32 = (value: number) => [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255];
const u16 = (value: number) => [value & 255, value >> 8];

/** A WAV file of 16 bit stereo samples at the measuring rate */
const wavOf = (samples: Int16Array) => {
  const sound = new Uint8Array(samples.buffer);
  const header = [
    ...ascii('RIFF'),
    ...u32(36 + sound.length),
    ...ascii('WAVE'),
    ...ascii('fmt '),
    ...u32(16),
    ...u16(1),
    ...u16(2),
    ...u32(measurementRate),
    ...u32(measurementRate * 4),
    ...u16(4),
    ...u16(16),
    ...ascii('data'),
    ...u32(sound.length),
  ];
  return Uint8Array.from([...header, ...sound]);
};

const seconds = 20;
/** A tone that is louder in the second half, in both channels */
const frames = Array.from({ length: seconds * measurementRate }, (_, index) => {
  const level = index < (seconds * measurementRate) / 2 ? 3000 : 12_000;
  return Math.round(level * Math.sin((2 * Math.PI * 440 * index) / measurementRate));
});
const stereo = Int16Array.from(frames.flatMap((value) => [value, value]));
const file = wavOf(stereo);

/** The decoder of the test reads the 16 bit samples of the WAV file it is given, as the browser decodes one */
const decode = async (bytes: ArrayBuffer) => {
  const samples = new Int16Array(bytes.slice(44));
  const channels = [0, 1].map((channel) => Float32Array.from({ length: samples.length / 2 }, (_, index) => samples[index * 2 + channel] / 32768));
  return { numberOfChannels: 2, getChannelData: (channel: number) => channels[channel] };
};

const serve = (bytes: Uint8Array, status = 206) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_: string, init?: RequestInit) => {
      const [start, end] = new Headers(init?.headers).get('Range')?.match(/\d+/g)?.map(Number) ?? [0, bytes.length - 1];
      const piece = bytes.slice(start, end + 1);
      return new Response(piece, { status, headers: { 'Content-Range': `bytes ${start}-${start + piece.length - 1}/${bytes.length}` } });
    })
  );

afterEach(() => vi.unstubAllGlobals());

describe('measureSliced', () => {
  it('gives the loudness of the whole file for a file that is decoded in pieces', async () => {
    serve(file);
    const whole = summarise([
      measureBlocks([0, 1].map((channel) => Float32Array.from({ length: frames.length }, (_, index) => stereo[index * 2 + channel] / 32768))),
    ]);

    // a file of 3.8 MB for the 1000 s that are given is cut in pieces of 1.15 MB
    const decoder = vi.fn(decode);
    const result = await measureSliced(1, 'tunelle://app/track?path=a', 1000, decoder, vi.fn());

    expect(decoder).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ outcome: 'measured' });
    if (result.outcome !== 'measured' || !whole) return;
    expect(result.analysis.integratedLufs).toBeCloseTo(whole.analysis.integratedLufs, 6);
    expect(result.analysis.loudnessRange).toBeCloseTo(whole.analysis.loudnessRange, 6);
    expect(result.trackPeak).toBe(whole.trackPeak);
  });

  it('tells that it makes progress while it reads and decodes the pieces', async () => {
    serve(file);
    const progress = vi.fn();

    await measureSliced(1, 'tunelle://app/track?path=a', 1000, decode, progress);

    // a chunk is told as it is read, and each of the 4 pieces as it is measured
    expect(progress.mock.calls.length).toBeGreaterThanOrEqual(4 + 4);
  });

  it('is too large for a format that is not cut', async () => {
    serve(Uint8Array.from([...ascii('MAC '), ...new Array(100).fill(0)]));

    expect(await measureSliced(1, 'tunelle://app/track?path=a', 7200, decode, vi.fn())).toEqual({ id: 1, outcome: 'too-large' });
  });

  it('is too large for a file of a format that is cut in a variant that is not, like an Ogg file of FLAC', async () => {
    serve(page(1, 0, 0, Uint8Array.from([0x7f, ...ascii('FLAC'), 0, 0, 0]), 0x02));

    expect(await measureSliced(1, 'tunelle://app/track?path=a', 7200, decode)).toEqual({ id: 1, outcome: 'too-large' });
  });

  it('is undecodable for a file that is not what its format says', async () => {
    serve(Uint8Array.from([...ascii('OggS'), ...new Array(100).fill(0)]));

    expect(await measureSliced(1, 'tunelle://app/track?path=a', 7200, decode)).toEqual({ id: 1, outcome: 'undecodable' });
  });

  it('is unreadable when the file cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    expect(await measureSliced(1, 'tunelle://app/track?path=a', 7200, decode, vi.fn())).toEqual({ id: 1, outcome: 'unreadable' });
  });

  it('is unreadable when the answer is not a range', async () => {
    serve(file, 200);

    expect(await measureSliced(1, 'tunelle://app/track?path=a', 7200, decode, vi.fn())).toEqual({ id: 1, outcome: 'unreadable' });
  });

  it('is undecodable when a piece cannot be decoded', async () => {
    serve(file);

    expect(await measureSliced(1, 'tunelle://app/track?path=a', 7200, async () => undefined, vi.fn())).toEqual({ id: 1, outcome: 'undecodable' });
  });

  it('is silent for a file without a block above the gate', async () => {
    serve(wavOf(new Int16Array(seconds * measurementRate * 2)));

    expect(await measureSliced(1, 'tunelle://app/track?path=a', 7200, decode, vi.fn())).toEqual({ id: 1, outcome: 'silent' });
  });
});
