import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { parseFile } from 'music-metadata';
import scanFolder from './library/scanFolder';
import executeQuery from './database/executeQuery';
import { createTestDatabase } from './test-database';

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

const meta = (title: string) => ({ common: { artist: 'Artist', album: 'Album', title }, format: { duration: 60 }, native: {} });
const firstWait = 2000;
const secondWait = 30_000;

describe('scanFolder of files that do not answer in time', () => {
  let database: Database;
  let root: string;
  let reads: string[];
  const sender = { send: vi.fn() } as unknown as WebContents;
  const parsed = vi.mocked(parseFile);
  const titles = () =>
    executeQuery<{ title: string }>(database, { query: 'SELECT title FROM library ORDER BY path', variables: [] }).then((rows) =>
      rows.map(({ title }) => title)
    );

  /** Reads of the files named never answer until they have been asked for `stallFor` times; the others answer at once */
  const stalls = (names: string[], stallFor: number) =>
    parsed.mockImplementation(((file: string) => {
      reads.push(path.basename(file));
      const asked = reads.filter((name) => name === path.basename(file)).length;
      return names.includes(path.basename(file)) && asked <= stallFor ? new Promise(() => undefined) : Promise.resolve(meta(path.basename(file)));
    }) as never);

  const untilRead = async (done: () => boolean): Promise<void> => {
    if (done()) return;
    await new Promise((resolve) => setImmediate(resolve));
    return untilRead(done);
  };

  /** Scans with the clock stopped, and lets a wait run out when the scan is waiting on a file that stalled */
  const scan = async (stalled: string[], waits: number[]) => {
    const scanning = scanFolder(root, sender);
    await waits.reduce(async (done, wait, index) => {
      await done;
      await untilRead(() => reads.filter((name) => stalled.includes(name)).length > index);
      await vi.advanceTimersByTimeAsync(wait);
    }, Promise.resolve());
    return scanning;
  };
  beforeEach(async () => {
    reads = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-slow-'));
    ['a.flac', 'b.flac', 'c.flac'].forEach((name) => fs.writeFileSync(path.join(root, name), 'not audio'));
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = root;
    // the worker is loaded before the clock stops, as the first load takes real time
    await import('./library/trackReaderWorker');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
    parsed.mockReset();
  });

  it('reads a file again that did not answer in time, and stores it with the files around it', async () => {
    stalls(['b.flac'], 1);

    const unread = await scan(['b.flac'], [firstWait]);

    expect(await titles()).toEqual(['a.flac', 'b.flac', 'c.flac']);
    expect(unread).toBe(0);
  });

  it('asks for the file again only after the others, with the longer wait', async () => {
    stalls(['a.flac'], 2);

    const unread = await scan(['a.flac'], [firstWait, secondWait]);

    expect(reads).toEqual(['a.flac', 'b.flac', 'c.flac', 'a.flac']);
    expect(await titles()).toEqual(['b.flac', 'c.flac']);
    expect(unread).toBe(1);
  });

  it('gives up at the first file that does not answer again, and tells how many are left unread', async () => {
    stalls(['b.flac', 'c.flac'], 2);

    const unread = await scan(['b.flac', 'c.flac'], [firstWait, firstWait, secondWait]);

    expect(reads).toEqual(['a.flac', 'b.flac', 'c.flac', 'b.flac']);
    expect(await titles()).toEqual(['a.flac']);
    expect(unread).toBe(2);
  });
});
