import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { z } from 'zod';
import { measureBlocks } from '../../client/loudness/block-energies';
import { measurementRate } from '../../client/loudness/k-weighting';
import { summarise } from '../../client/loudness/summarise';
import executeQuery from '../database/execute-query';
import scanFolder from '../library/scan/scan-folder';
import { createTestDatabase } from '../test-database';
import { readWav, resample } from '../test-wav';

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-loudness-'));

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

const trackSchema = z.object({ path: z.string(), codec: z.string() });

// The measurement as the hidden window of the app does it (client/loudness/measure-track.ts), with the samples resampled to the rate of the measurement where Chromium's
// decodeAudioData does it. A sine of half the full scale in one channel is at -9.7 LUFS (BS.1770, e2e/loudness.spec.ts); a quarter of that amplitude is 12 dB under.
const measureSamples = (channels: Float32Array[]) => {
  const measured = summarise([measureBlocks(channels)]);
  if (!measured) throw new Error('The sound is silent');
  return measured.analysis;
};
const measureDecoded = (file: string) => {
  const { channelData, sampleRate } = readWav(file);
  return measureSamples(channelData.map((samples) => resample(samples, sampleRate, measurementRate)));
};

// the sines of e2e/fixtures: the ones that ffmpeg made are at its default amplitude of 0.125, the DSD ones at 0.5 (scripts/tooling/generate-dsd-fixtures.ts)
const formats = [
  { folder: 'alac', amplitude: 0.125 },
  { folder: 'ape', amplitude: 0.125 },
  { folder: 'wavpack', amplitude: 0.125 },
  { folder: 'aiff', amplitude: 0.125 },
  { folder: 'dsd', amplitude: 0.5 },
  { folder: 'wma', amplitude: 0.125 },
];
// the ideal sine at the rate of the measurement, which the decoded sound is compared with
const sineLufs = (frequency: number, amplitude: number) =>
  measureSamples([Float32Array.from({ length: measurementRate * 6 }, (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / measurementRate))])
    .integratedLufs;

describe('the loudness of the decoded sound of the formats that Chromium does not play', () => {
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

  it('measures an ideal sine of half the full scale at the level that the end to end test of Chromium expects', () => {
    expect(sineLufs(440, 0.5)).toBeCloseTo(-9.7, 1);
  });

  it.each(formats)('measures the decoded sines of $folder like the ideal ones they were made as', async ({ folder, amplitude }) => {
    const tracks = await executeQuery(
      database,
      { query: 'SELECT path, codec FROM library WHERE path LIKE ? ORDER BY path', variables: [`%/fixtures/${folder}/%`] },
      trackSchema
    );
    const wavs = await Promise.all(tracks.map((track) => playableFile({ ...track, bitDepth: null }, new AbortController().signal)));
    const analyses = wavs.map((file) => measureDecoded(file ?? 'missing'));

    expect(analyses).toHaveLength(2);
    expect(analyses[0].integratedLufs).toBeCloseTo(sineLufs(440, amplitude), 1);
    expect(analyses[1].integratedLufs).toBeCloseTo(sineLufs(880, amplitude), 1);
    expect(analyses.map(({ samplePeak }) => samplePeak)).toEqual([expect.closeTo(amplitude, 2), expect.closeTo(amplitude, 2)]);
  });
});
