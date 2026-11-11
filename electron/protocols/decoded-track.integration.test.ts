import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { z } from 'zod';
import executeQuery from '../database/execute-query';
import scanFolder from '../library/scan/scan-folder';
import { createTestDatabase } from '../test-database';

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-integration-'));

// the electron module is the only thing replaced: it says where the app is and where it may write, and its utility process reads the tags with the code of the worker
vi.mock('electron', async () => {
  const { EventEmitter } = await import('events');
  const { answer } = await import('../library/reading/track-reader-worker');
  class InProcessReader extends EventEmitter {
    postMessage = async (request: Parameters<typeof answer>[0]) => this.emit('message', await answer(request));
    kill = () => this.emit('exit', 0);
  }
  return { app: { isPackaged: false, getAppPath: () => path.join(root, 'out'), getPath: () => temp }, utilityProcess: { fork: () => new InProcessReader() } };
});

const { playableFile } = await import('./decoded-track');

const trackSchema = z.object({ path: z.string(), title: z.string(), codec: z.string() });

/** The level of a sine of the frequency in the samples (Goertzel), as a share of the level of all of them */
const toneShare = (samples: Float64Array, frequency: number, sampleRate: number) => {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  const [last, beforeLast] = samples.reduce(([previous, older], sample) => [sample + coefficient * previous - older, previous], [0, 0]);
  const power = last ** 2 + beforeLast ** 2 - coefficient * last * beforeLast;
  const energy = samples.reduce((sum, sample) => sum + sample ** 2, 0);
  return (2 * power) / (samples.length * energy);
};

const readWav = (file: string) => {
  const data = fs.readFileSync(file);
  const chunks = (offset: number): { name: string; start: number; size: number }[] =>
    offset + 8 > data.length
      ? []
      : [
          { name: data.toString('ascii', offset, offset + 4), start: offset + 8, size: data.readUInt32LE(offset + 4) },
          ...chunks(offset + 8 + data.readUInt32LE(offset + 4) + (data.readUInt32LE(offset + 4) % 2)),
        ];
  const found = chunks(12);
  const format = found.find(({ name }) => name === 'fmt ');
  const body = found.find(({ name }) => name === 'data');
  if (!format || !body || data.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${file} is not a WAV file`);
  const channels = data.readUInt16LE(format.start + 2);
  const sampleRate = data.readUInt32LE(format.start + 4);
  const bytes = data.readUInt16LE(format.start + 14) / 8;
  const size = Math.min(body.size, data.length - body.start);
  const frames = Math.floor(size / (bytes * channels));
  // the first channel; the sample is a signed little endian integer of 2, 3 or 4 bytes
  const samples = Float64Array.from({ length: frames }, (_, frame) => data.readIntLE(body.start + frame * bytes * channels, bytes) / 2 ** (bytes * 8 - 1));
  return { channels, sampleRate, bytes, seconds: frames / sampleRate, samples };
};

// the fixtures of the end to end tests: the first track is a sine of 440 Hz, the second one of 880 Hz
const formats = [
  { folder: 'alac', codec: 'ALAC', bytes: 2, seconds: 6 },
  { folder: 'ape', codec: "MONKEY'S", bytes: 2, seconds: 6 },
  { folder: 'wavpack', codec: 'WAVPACK', bytes: 2, seconds: 6 },
  { folder: 'aiff', codec: 'AIFF', bytes: 2, seconds: 6 },
  { folder: 'dsd', codec: 'DSD', bytes: 3, seconds: 3 },
  { folder: 'wma', codec: 'WMA', bytes: 2, seconds: 6 },
];

describe('scanning and decoding the formats that Chromium does not play', () => {
  let database: Database;
  const sender = { send: vi.fn() } as unknown as WebContents;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = temp;
    await Promise.all(formats.map(({ folder }) => scanFolder(path.join(root, 'e2e', 'fixtures', folder), sender)));
  });

  afterAll(() => {
    global._database = undefined;
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it.each(formats)('reads the tags of $folder and decodes both tracks to the tone they hold', async ({ folder, codec, bytes, seconds }) => {
    const tracks = await executeQuery(
      database,
      { query: 'SELECT path, title, codec FROM library WHERE path LIKE ? ORDER BY path', variables: [`%/fixtures/${folder}/%`] },
      trackSchema
    );

    expect(tracks.map(({ title }) => title)).toEqual(['Concert A', 'Octave Up']);
    expect(tracks.map((track) => track.codec.toUpperCase().replace('AIFF-C', 'AIFF'))).toEqual([codec, codec]);

    const wavs = await Promise.all(tracks.map((track) => playableFile({ ...track, bitDepth: null }, new AbortController().signal)));
    const decoded = wavs.map((file) => readWav(file ?? 'missing'));

    expect(decoded.map(({ bytes: width }) => width)).toEqual([bytes, bytes]);
    expect(decoded.map(({ seconds: length }) => Math.round(length))).toEqual([seconds, seconds]);
    expect(decoded.map(({ samples, sampleRate }, index) => toneShare(samples, index === 0 ? 440 : 880, sampleRate))).toEqual([
      expect.toSatisfy((share: number) => share > 0.9),
      expect.toSatisfy((share: number) => share > 0.9),
    ]);
  });
});
