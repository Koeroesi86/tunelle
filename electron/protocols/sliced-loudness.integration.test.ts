import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { measureBlocks } from '../../client/loudness/block-energies';
import { measurementRate } from '../../client/loudness/k-weighting';
import { measureSliced } from '../../client/loudness/measure-sliced';
import { summarise } from '../../client/loudness/summarise';
import { readWav, resample } from '../test-wav';

// What the hidden window does with a track that is too long to decode as a whole (client/loudness/measure-track.ts), on a real file served in ranges:
// the pieces are cut by the slicer of the format, decoded (here by reading the WAV of each piece) and measured with one meter.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-sliced-'));
const file = path.join(temp, 'long-mix.wav');
const rate = 8000;
const seconds = 800;
const url = 'tunelle://app/track?path=long-mix';

const writeLongWav = () => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + seconds * rate * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(seconds * rate * 2, 40);
  const sound = Buffer.alloc(seconds * rate * 2);
  for (let index = 0; index < seconds * rate; index += 1) sound.writeInt16LE(Math.round(16384 * Math.sin((2 * Math.PI * 440 * index) / rate)), index * 2);
  fs.writeFileSync(file, Buffer.concat([header, sound]));
};

const serveRanges = async (_url: string, init?: RequestInit) => {
  const data = fs.readFileSync(file);
  const [start, end] = new Headers(init?.headers)
    .get('Range')
    ?.match(/bytes=(\d+)-(\d+)/)
    ?.slice(1)
    .map(Number) ?? [0, data.length - 1];
  return new Response(data.subarray(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${data.length}` } });
};

let pieces = 0;
const decode = async (bytes: ArrayBuffer) => {
  pieces += 1;
  const piece = path.join(temp, `piece-${pieces}.wav`);
  fs.writeFileSync(piece, Buffer.from(bytes));
  const { samples, sampleRate } = readWav(piece);
  const resampled = resample(samples, sampleRate, measurementRate);
  return { numberOfChannels: 1, getChannelData: () => resampled };
};

describe('the loudness of a track that is cut into pieces', () => {
  beforeAll(() => {
    writeLongWav();
  });

  afterAll(() => {
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it('measures the pieces of a long WAV like the whole file, and reads it in more than one piece', async () => {
    vi.stubGlobal('fetch', serveRanges);
    const result = await measureSliced(1, url, seconds, decode, () => undefined);
    const { samples, sampleRate } = readWav(file);
    const whole = summarise([measureBlocks([resample(samples, sampleRate, measurementRate)])]);

    expect(pieces).toBeGreaterThan(2);
    expect(result.outcome).toBe('measured');
    expect(result).toMatchObject({ analysis: { integratedLufs: expect.closeTo(whole?.analysis.integratedLufs ?? 0, 1) } });
  });
});
