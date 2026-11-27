import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { z } from 'zod';
import { noiseFixtures, noisePcm } from '../../scripts/tooling/noise-fixtures';
import executeQuery from '../database/execute-query';
import scanFolder from '../library/scan/scan-folder';
import { createTestDatabase } from '../test-database';
import { readWav } from '../test-wav';

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-bit-exact-'));

// as in decoded-track.integration.test.ts: only the electron module is replaced
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
const { windowedTrack } = await import('./windowed-track');

const trackSchema = z.object({ path: z.string(), codec: z.string(), bitDepth: z.number().nullable(), sampleRate: z.number() });
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const signal = () => new AbortController().signal;

const wholeDecode = async (track: z.infer<typeof trackSchema>) => (await playableFile(track, signal())) ?? 'missing';

/** The WAV that the player reads while it is decoded, undefined for a track that is only decoded whole */
const windowedDecode = async (track: z.infer<typeof trackSchema>) => {
  const windowed = await windowedTrack(track, signal());
  if (!windowed) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of windowed.read(0, windowed.size - 1, signal())) chunks.push(chunk);
  const file = path.join(temp, `windowed-${path.basename(track.path)}.wav`);
  fs.writeFileSync(file, Buffer.concat(chunks));
  return file;
};

/** More than two channels, and the containers whose length ffprobe does not give exactly (docs/app/decoder-windowed.md) */
const decodedWholeOnly = (file: string) => /-6ch-|^caf-alac-|^mka-/.test(file);

/** What the scan stores where `music-metadata` reads it short of the file, which the decoder makes up for. See docs/app/decoder-formats.md */
const misread: Record<string, { bitDepth?: null; sampleRate?: number } | undefined> = {
  'caf-alac-2ch-16-44100.caf': { bitDepth: null },
  'caf-alac-2ch-24-96000.caf': { bitDepth: null },
  'alac-2ch-24-96000.m4a': { sampleRate: 48000 },
};

describe('the samples of lossless files through the scan and the decoder', () => {
  let database: Database;
  const sender = { send: vi.fn() } as unknown as WebContents;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = temp;
    await scanFolder(path.join(root, 'e2e', 'fixtures', 'noise'), sender);
  });

  afterAll(() => {
    global._database = undefined;
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it.each(noiseFixtures)('keeps every sample of $file', async (fixture) => {
    const [track] = await executeQuery(
      database,
      { query: 'SELECT path, codec, bitDepth, sampleRate FROM library WHERE path LIKE ?', variables: [`%/fixtures/noise/${fixture.file}`] },
      trackSchema
    );
    expect(track).toMatchObject({ bitDepth: fixture.bits, sampleRate: fixture.sampleRate, ...misread[fixture.file] });
    expect(track.codec.toUpperCase()).toBe(fixture.codec);

    const windowed = await windowedDecode(track);
    const files = [await wholeDecode(track), ...(windowed ? [windowed] : [])];
    const source = noisePcm(fixture);

    expect(windowed === undefined).toBe(decodedWholeOnly(fixture.file));
    files.map(readWav).forEach(({ channels, sampleRate, bytes, pcm }) => {
      expect([channels, sampleRate, bytes]).toEqual([fixture.channels, fixture.sampleRate, fixture.bits / 8]);
      expect(hash(pcm)).toBe(hash(source));
    });
  });
});
