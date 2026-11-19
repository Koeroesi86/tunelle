import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { parseFile } from 'music-metadata';
import scanFolder from './scan-folder';
import executeQuery from '../../database/execute-query';
import { createTestDatabase } from '../../test-database';

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

const meta = (common: object = {}) => ({
  common: { artist: 'Artist', album: 'Album', title: 'Title', ...common },
  format: { duration: 60 },
  native: {},
});

describe('scanFolder loudness', () => {
  let database: Database;
  let root: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const stored = () =>
    executeQuery<Record<string, unknown>>(database, { query: 'SELECT trackGain, albumGain, trackPeak, albumPeak FROM library', variables: [] });
  const parsed = vi.mocked(parseFile);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-loudness-'));
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

  it('stores the ReplayGain of a file', async () => {
    parsed.mockResolvedValue(
      meta({
        replaygain_track_gain: { dB: -6.5, ratio: 0.22 },
        replaygain_album_gain: { dB: -8, ratio: 0.16 },
        replaygain_track_peak: { dB: -1, ratio: 0.9 },
      }) as never
    );

    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ trackGain: -6.5, albumGain: -8, trackPeak: 0.9, albumPeak: null }]);
  });

  it('fills in a row that was stored before the tags were read', async () => {
    parsed.mockResolvedValue(meta() as never);
    await scanFolder(root, sender);
    // a row of an older app has not kept the file stat, so its file is read again
    await executeQuery(database, { query: 'UPDATE library SET fileModified = NULL, fileSize = NULL', variables: [] });
    parsed.mockResolvedValue(meta({ replaygain_track_gain: { dB: -3, ratio: 0.7 } }) as never);

    await scanFolder(root, sender);

    expect(await stored()).toEqual([{ trackGain: -3, albumGain: null, trackPeak: null, albumPeak: null }]);
  });
});
