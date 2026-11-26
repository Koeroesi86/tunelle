import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readWav, toneShare } from '../test-wav';
import { ffmpegProgram } from './ffmpeg-program';
import { cacheFolder } from './cache-folder';

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-windowed-'));

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => path.join(root, 'out'), getPath: () => temp } }));

let windowedTrack: typeof import('./windowed-track').windowedTrack;

const fixture = (folder: string, name: string) => path.join(root, 'e2e', 'fixtures', folder, name);
const readAll = async (read: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of read) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const open = async (source: string, codec: string, bitDepth: number | null) => {
  const track = await windowedTrack({ path: source, codec, bitDepth }, new AbortController().signal);
  if (!track) throw new Error(`expected a windowed track for ${source}`);
  return track;
};

/** A read with no window open, so it starts a decode at its first byte */
const readFresh = async (source: string, codec: string, bitDepth: number | null, start: number) => {
  vi.resetModules();
  ({ windowedTrack } = await import('./windowed-track'));
  const track = await open(source, codec, bitDepth);
  return readAll(track.read(start, track.size - 1, new AbortController().signal));
};

/** The samples that one run of ffmpeg gives from the start to the end */
const decodeWhole = (source: string, codec: string, bitDepth: number | null) => {
  const raw = codec === 'IEEE_FLOAT' ? 'f32le' : bitDepth === 24 ? 's24le' : 's16le';
  return execFileSync(
    ffmpegProgram(),
    ['-nostdin', '-v', 'error', '-fflags', '+bitexact', '-i', source, '-map', '0:a:0', '-c:a', `pcm_${raw}`, '-f', raw, 'pipe:1'],
    { maxBuffer: 64 * 1024 ** 2 }
  );
};

describe('windowedTrack with the real ffmpeg', () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ windowedTrack } = await import('./windowed-track'));
  });
  afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

  // one row for each codec of `progressiveCodecs`, and the containers and depths that differ in how they are sought
  it.each([
    ['alac', '1-concert-a.m4a', 'ALAC', null],
    ['flac', '1-concert-a.flac', 'FLAC', null],
    ['flac-hires', '1-concert-a.flac', 'FLAC', 24],
    ['ape', '1-concert-a.ape', "MONKEY'S", null],
    ['wavpack', '1-concert-a.wv', 'WAVPACK', null],
    ['aiff', '1-concert-a.aiff', 'AIFF', null],
    ['aiff', '2-octave-up.aifc', 'AIFF-C', null],
    ['wav', '1-concert-a.wav', 'WAV', null],
    ['rf64', '1-concert-a.wav', 'WAV', null],
    ['w64', '1-concert-a.w64', 'WAV', null],
    ['caf', '1-concert-a.caf', 'CAF', null],
    ['wav-float', '1-concert-a.wav', 'IEEE_FLOAT', null],
  ])(
    'serves the %s fixture %s with its final size, and from any offset the samples of the whole decode',
    async (folder, name, codec, bitDepth) => {
      const source = fixture(folder, name);
      const samples = decodeWhole(source, codec, bitDepth);

      const whole = await readFresh(source, codec, bitDepth, 0);

      expect(whole.subarray(44).equals(samples)).toBe(true);
      // frames at the start, at and after a block of 4096, in the middle and near the end, and a byte inside a frame
      const frameSize = bitDepth === 24 ? 6 : 4;
      const frames = samples.length / frameSize;
      for (const offset of [1, 4096, 4097, Math.floor(frames / 2) + 3, frames - 1000].map((frame) => frame * frameSize).concat(100_001)) {
        const part = await readFresh(source, codec, bitDepth, 44 + offset);
        expect(part.equals(samples.subarray(offset)), `from byte ${offset}`).toBe(true);
      }
    },
    60_000
  );

  it('gives a WAV that holds the tone of the file', async () => {
    const track = await open(fixture('alac', '1-concert-a.m4a'), 'ALAC', null);
    const file = path.join(temp, 'alac.wav');
    fs.writeFileSync(file, await readAll(track.read(0, track.size - 1, new AbortController().signal)));

    const decoded = readWav(file);

    expect(Math.round(decoded.seconds)).toBe(6);
    expect(toneShare(decoded.samples, 440, decoded.sampleRate)).toBeGreaterThan(0.9);
  });

  it('writes no copy to the cache', async () => {
    const track = await open(fixture('flac', '2-octave-up.flac'), 'FLAC', null);
    await readAll(track.read(0, track.size - 1, new AbortController().signal));

    expect(fs.existsSync(cacheFolder('whole-decodes'))).toBe(false);
  });

  it('leaves a codec without an exact length to the whole decode', async () => {
    await expect(
      windowedTrack({ path: fixture('wma', '1-concert-a.wma'), codec: 'WMA', bitDepth: null }, new AbortController().signal)
    ).resolves.toBeUndefined();
  });

  it('leaves ALAC in CAF, which says more frames than its decode gives, to the whole decode', async () => {
    await expect(
      windowedTrack({ path: fixture('caf-alac', '1-concert-a.caf'), codec: 'ALAC', bitDepth: null }, new AbortController().signal)
    ).resolves.toBeUndefined();
  });

  it('ends a read early when the request is aborted', async () => {
    const aborted = new AbortController();
    const track = await open(fixture('wavpack', '2-octave-up.wv'), 'WAVPACK', null);
    aborted.abort();

    expect(await readAll(track.read(0, track.size - 1, aborted.signal))).toHaveLength(0);
  });
});
