import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { parseFile } from 'music-metadata';
import scanFolder from './scanFolder';
import executeQuery from '../database/executeQuery';
import { createTestDatabase } from '../test-database';

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

const meta = (format: object) => ({
  common: { artist: 'Artist', album: 'Album', title: 'Title' },
  format: { duration: 60, ...format },
  native: {},
});

describe('scanFolder audio format', () => {
  let database: Database;
  let root: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const stored = () =>
    executeQuery<Record<string, unknown>>(database, { query: 'SELECT codec, bitDepth, sampleRate, bitrate, vbr, lossless FROM library', variables: [] });
  const parsed = vi.mocked(parseFile);

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-format-'));
    fs.writeFileSync(path.join(root, 'a.flac'), 'not audio');
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = root;
  });

  afterEach(() => {
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
    parsed.mockReset();
  });

  it('stores the format of a file', async () => {
    parsed.mockResolvedValue(meta({ codec: 'FLAC', lossless: true, bitsPerSample: 24, sampleRate: 96000, bitrate: 2304000 }) as never);

    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ codec: 'FLAC', bitDepth: 24, sampleRate: 96000, bitrate: 2304000, vbr: null, lossless: 1 }]);
  });

  it('fills in a row that was stored before the format was read', async () => {
    parsed.mockResolvedValue(meta({}) as never);
    await scanFolder(root, sender);
    expect(await stored()).toEqual([{ codec: null, bitDepth: null, sampleRate: null, bitrate: null, vbr: null, lossless: null }]);
    // a row of an older app has not kept the file stat, so its file is read again
    await executeQuery(database, { query: 'UPDATE library SET fileModified = NULL, fileSize = NULL', variables: [] });

    parsed.mockResolvedValue(meta({ codec: 'FLAC', lossless: true, bitsPerSample: 16, sampleRate: 44100 }) as never);
    await scanFolder(root, sender);

    expect(await stored()).toEqual([expect.objectContaining({ codec: 'FLAC', bitDepth: 16, sampleRate: 44100, lossless: 1 })]);
  });
});
