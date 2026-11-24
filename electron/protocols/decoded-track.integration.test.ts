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
import { readWav, toneShare } from '../test-wav';

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

const trackSchema = z.object({ path: z.string(), title: z.string(), codec: z.string(), bitDepth: z.number().nullable() });

// the fixtures of the end to end tests: the first track is a sine of 440 Hz, the second one of 880 Hz
const formats = [
  { folder: 'flac', codec: 'FLAC', bytes: 2, seconds: 6 },
  { folder: 'flac-hires', codec: 'FLAC', bytes: 3, seconds: 6 },
  { folder: 'alac', codec: 'ALAC', bytes: 2, seconds: 6 },
  { folder: 'vorbis', codec: 'VORBIS', bytes: 2, seconds: 6 },
  { folder: 'ape', codec: "MONKEY'S", bytes: 2, seconds: 6 },
  { folder: 'wavpack', codec: 'WAVPACK', bytes: 2, seconds: 6 },
  { folder: 'aiff', codec: 'AIFF', bytes: 2, seconds: 6 },
  { folder: 'dsd', codec: 'DSD', bytes: 3, seconds: 3 },
  { folder: 'wavpack-dsd', codec: 'DSD', bytes: 3, seconds: 3 },
  { folder: 'wma', codec: 'WMA', bytes: 2, seconds: 6 },
  { folder: 'mp3', codec: 'MP3', bytes: 2, seconds: 6 },
  { folder: 'mp2', codec: 'MP2', bytes: 2, seconds: 6 },
  { folder: 'ac3', codec: 'AC-3', bytes: 2, seconds: 6 },
  { folder: 'mka', codec: 'FLAC', bytes: 2, seconds: 6 },
  { folder: 'opus', codec: 'OPUS', bytes: 2, seconds: 6 },
  { folder: 'wav', codec: 'WAV', bytes: 2, seconds: 6 },
  { folder: 'wav-float', codec: 'IEEE_FLOAT', bytes: 4, seconds: 6 },
  { folder: 'wav-adpcm', codec: 'ADPCM', bytes: 2, seconds: 6 },
  { folder: 'wav-ima', codec: 'DVI_ADPCM', bytes: 2, seconds: 6 },
  { folder: 'caf', codec: 'CAF', bytes: 2, seconds: 6 },
  { folder: 'caf-alac', codec: 'ALAC', bytes: 2, seconds: 6 },
  { folder: 'rf64', codec: 'WAV', bytes: 2, seconds: 6 },
  // Wave64 has no tags that ffmpeg writes or the scan reads, so the titles are empty
  { folder: 'w64', codec: 'WAV', bytes: 2, seconds: 6, titles: ['', ''] },
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

  it.each(formats)(
    'reads the tags of $folder and decodes both tracks to the tone they hold',
    async ({ folder, codec, bytes, seconds, titles = ['Concert A', 'Octave Up'] }) => {
      const tracks = await executeQuery(
        database,
        { query: 'SELECT path, title, codec, bitDepth FROM library WHERE path LIKE ? ORDER BY path', variables: [`%/fixtures/${folder}/%`] },
        trackSchema
      );

      expect(tracks.map(({ title }) => title)).toEqual(titles);
      expect(tracks.map((track) => track.codec.toUpperCase().replace('AIFF-C', 'AIFF'))).toEqual([codec, codec]);

      const wavs = await Promise.all(tracks.map((track) => playableFile(track, new AbortController().signal)));
      const decoded = wavs.map((file) => readWav(file ?? 'missing'));

      expect(decoded.map(({ bytes: width }) => width)).toEqual([bytes, bytes]);
      expect(decoded.map(({ seconds: length }) => Math.round(length))).toEqual([seconds, seconds]);
      expect(decoded.map(({ samples, sampleRate }, index) => toneShare(samples, index === 0 ? 440 : 880, sampleRate))).toEqual([
        expect.toSatisfy((share: number) => share > 0.9),
        expect.toSatisfy((share: number) => share > 0.9),
      ]);
    }
  );
});
