import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import { memoryFs } from '../../electron/test-memory-fs';
import { noiseFixtures, noiseFrames, noisePcm } from './noise-fixtures';

vi.mock('fs', () => {
  const mkdtempSync = (prefix: string) => {
    memoryFs.sync.mkdirSync(prefix);
    return prefix;
  };
  const fs = { ...memoryFs.sync, mkdtempSync };
  return { ...fs, default: fs };
});
vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

describe('generate-noise-fixtures', () => {
  const argv = process.argv;
  const folder = path.join(path.sep, 'noise');

  beforeEach(() => {
    memoryFs.reset();
    process.argv = ['node', 'generate-noise-fixtures.ts', folder];
  });

  afterEach(() => {
    process.argv = argv;
  });

  it('writes every fixture with ffmpeg or wavpack, from a WAV of its own noise', async () => {
    vi.resetModules();
    await import('./generate-noise-fixtures');

    const calls = vi.mocked(execFileSync).mock.calls.map(([tool, args]) => [tool, args?.at(-1)]);
    expect(calls).toEqual(noiseFixtures.map(({ tool, file }) => [tool, path.join(folder, file)]));
  });

  it('names each file once', () => {
    expect(new Set(noiseFixtures.map(({ file }) => file)).size).toBe(noiseFixtures.length);
  });

  it('makes the same noise each time, of the size of the samples, and other noise in each channel', () => {
    const format = { channels: 2, bits: 24, sampleRate: 96000 } as const;
    const pcm = noisePcm(format);
    const channel = (offset: number) =>
      Buffer.concat(Array.from({ length: noiseFrames }, (_, frame) => pcm.subarray(frame * 6 + offset, frame * 6 + offset + 3)));

    expect(pcm).toHaveLength(noiseFrames * 6);
    expect(noisePcm(format).equals(pcm)).toBe(true);
    expect(channel(0).equals(channel(3))).toBe(false);
  });
});
