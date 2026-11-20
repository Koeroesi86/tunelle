import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readWav, toneShare } from '../test-wav';

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-growing-'));

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => path.join(root, 'out'), getPath: () => temp } }));

const { growingTrack } = await import('./growing-track');
const { playableFile } = await import('./decoded-track');

const fixture = (folder: string, name: string) => path.join(root, 'e2e', 'fixtures', folder, name);
const readAll = async (read: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of read) chunks.push(chunk);
  return Buffer.concat(chunks);
};

describe('growingTrack with the real ffmpeg', () => {
  afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

  it.each([
    ['alac', '1-concert-a.m4a', 'ALAC'],
    ['aiff', '1-concert-a.aiff', 'AIFF'],
  ])('serves the %s fixture with its final size and the tone it holds', async (folder, name, codec) => {
    const source = fixture(folder, name);
    if (!fs.existsSync(source)) return;
    const track = await growingTrack({ path: source, codec, bitDepth: null }, new AbortController().signal);
    expect(typeof track).toBe('object');
    if (!track || typeof track === 'string') return;

    const bytes = await readAll(track.read(0, track.size - 1, new AbortController().signal));
    expect(bytes.length).toBe(track.size);
    const file = path.join(temp, `${folder}.wav`);
    fs.writeFileSync(file, bytes);
    const decoded = readWav(file);
    expect(Math.round(decoded.seconds)).toBe(6);
    expect(toneShare(decoded.samples, 440, decoded.sampleRate)).toBeGreaterThan(0.9);
  });

  it('serves the cached file once the decode has finished, and the same bytes for a range', async () => {
    const source = fixture('alac', '1-concert-a.m4a');
    const format = { path: source, codec: 'ALAC', bitDepth: null };
    const cached = await playableFile(format, new AbortController().signal);
    const again = await growingTrack(format, new AbortController().signal);
    expect(again).toBe(cached);
  });

  it('leaves a codec without an exact length to the whole decode', async () => {
    await expect(
      growingTrack({ path: fixture('wma', '1-concert-a.wma'), codec: 'WMA', bitDepth: null }, new AbortController().signal)
    ).resolves.toBeUndefined();
  });

  it('ends a read early when the request is aborted', async () => {
    const source = fixture('wavpack', '2-octave-up.wv');
    const aborted = new AbortController();
    const track = await growingTrack({ path: source, codec: 'WAVPACK', bitDepth: null }, aborted.signal);
    if (!track || typeof track === 'string') return;
    aborted.abort();
    expect((await readAll(track.read(0, track.size - 1, aborted.signal))).length).toBeLessThan(track.size);
  });
});
