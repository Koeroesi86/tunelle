import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'child_process';
import { probeAudio, probeFormat } from './probe-audio';
import { logError } from '../utils/log-error';

vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => '/temp', getAppPath: () => '/app/dist', isPackaged: false } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

const answer = (error: Error | null, stdout: string) =>
  vi
    .mocked(execFile)
    .mockImplementationOnce(((_program: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string) => void) =>
      callback(error, stdout)) as unknown as typeof execFile);

const stream = (overrides: object = {}) =>
  JSON.stringify({ streams: [{ sample_rate: '44100', channels: 2, time_base: '1/44100', duration_ts: 441000, ...overrides }] });

describe('probeAudio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the channels, the rate and the frames of a stream whose time base is one frame', async () => {
    answer(null, stream());
    await expect(probeAudio('/music/a.m4a')).resolves.toEqual({ channels: 2, sampleRate: 44100, frames: 441000 });
    expect(vi.mocked(execFile).mock.calls[0][0]).toMatch(/ffprobe(\.exe)?$/);
  });

  it.each([
    ['a time base that is not one frame', stream({ time_base: '1/1000' })],
    ['no frames', stream({ duration_ts: 0 })],
    ['an answer that is not JSON', 'nope'],
    ['an answer without a stream', JSON.stringify({ streams: [] })],
  ])('returns undefined for %s', async (_name, stdout) => {
    answer(null, stdout);
    await expect(probeAudio('/music/a.m4a')).resolves.toBeUndefined();
  });

  it('logs and returns undefined when ffprobe fails', async () => {
    const error = new Error('gone');
    answer(error, '');
    await expect(probeAudio('/music/a.m4a')).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(error);
  });
});

const probed = (found: object, container: string) => JSON.stringify({ streams: [found], format: { format_name: container } });

describe('probeFormat', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['alac', 'mov,mp4,m4a', 's32p', 0, '24', { codec: 'ALAC', bitDepth: 24, float: false }],
    ['aac', 'mov,mp4,m4a', 'fltp', 0, undefined, { codec: 'AAC', bitDepth: null, float: true }],
    ['pcm_s24be', 'aiff', 's32', 24, 'N/A', { codec: 'AIFF', bitDepth: 24, float: false }],
    ['pcm_s16be', 'caf', 's16', 16, 'N/A', { codec: 'CAF', bitDepth: 16, float: false }],
    ['pcm_s24le', 'w64', 's32', 24, 'N/A', { codec: 'WAV', bitDepth: 24, float: false }],
    ['pcm_f64le', 'wav', 'dbl', 64, 'N/A', { codec: 'IEEE_FLOAT', bitDepth: 64, float: true }],
    ['pcm_alaw', 'wav', 's16', 8, 'N/A', { codec: 'ALAW', bitDepth: 8, float: false }],
    ['wavpack', 'wv', 'fltp', 0, '8', { codec: 'DSD', bitDepth: 1, float: true }],
    ['wavpack', 'wv', 'fltp', 0, '32', { codec: 'WAVPACK', bitDepth: 32, float: true }],
    ['dsd_lsbf_planar', 'dsf', 'fltp', 8, 'N/A', { codec: 'DSD', bitDepth: 8, float: true }],
    ['ape', 'ape', 's32p', 0, '24', { codec: "MONKEY'S", bitDepth: 24, float: false }],
    ['wmav2', 'asf', 'fltp', 0, undefined, { codec: 'WMA', bitDepth: null, float: true }],
  ])('names %s in %s as the library does', async (codec, container, sampleFormat, stored, raw, expected) => {
    answer(null, probed({ codec_name: codec, sample_fmt: sampleFormat, bits_per_sample: stored, bits_per_raw_sample: raw }, container));

    await expect(probeFormat('/temp/a.src')).resolves.toEqual(expected);
  });

  it('returns undefined for a file that ffprobe can not read', async () => {
    answer(new Error('unknown'), '');

    await expect(probeFormat('/temp/a.src')).resolves.toBeUndefined();
  });
});
