import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'child_process';
import { probeAudio } from './probe-audio';
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
