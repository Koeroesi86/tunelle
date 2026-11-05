import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import scanFolder from './scanFolder';
import { createTestDatabase } from '../test-database';
import { cancelScansInside } from './scanCancellation';
import { getTracksInside } from '../repositories/libraryRepository';

describe('scanFolder', () => {
  let database: Database;
  let root: string;
  const send = vi.fn();
  const sender = { send } as unknown as WebContents;
  const scanningFiles = () => send.mock.calls.filter(([channel]) => channel === 'SCANNING_FILE').map(([, payload]) => payload);

  beforeEach(async () => {
    send.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-'));
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = root;
  });

  afterEach(() => {
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('counts only the supported audio files', async () => {
    fs.writeFileSync(path.join(root, 'a.mp3'), 'not audio');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'b.flac'), 'not audio');
    fs.writeFileSync(path.join(root, 'cover.jpg'), 'image');
    fs.writeFileSync(path.join(root, 'notes.txt'), 'text');

    await scanFolder(root, sender);

    expect(scanningFiles()).toEqual([expect.objectContaining({ progress: 0, totalCount: 2 }), expect.objectContaining({ progress: 1, totalCount: 2 })]);
  });

  it('starts clean after a scan that failed', async () => {
    await expect(scanFolder(path.join(root, 'missing'), sender)).rejects.toThrow();
    fs.writeFileSync(path.join(root, 'a.mp3'), 'not audio');

    await scanFolder(root, sender);

    expect(scanningFiles()).toEqual([expect.objectContaining({ progress: 0, totalCount: 1 })]);
  });

  it('stops with the abort when the signal is aborted, before it reads another file', async () => {
    ['a.mp3', 'b.mp3'].forEach((name) => fs.writeFileSync(path.join(root, name), 'not audio'));
    const controller = new AbortController();
    send.mockImplementation((channel) => channel === 'SCANNING_FILE' && controller.abort());

    await expect(scanFolder(root, sender, true, controller.signal)).rejects.toThrow();

    expect(scanningFiles()).toHaveLength(1);
  });

  it('does not wait between files', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    ['a.mp3', 'b.mp3', 'c.mp3'].forEach((name) => fs.writeFileSync(path.join(root, name), 'not audio'));

    try {
      await scanFolder(root, sender);
    } finally {
      vi.useRealTimers();
    }

    expect(scanningFiles().map((file) => file.progress)).toEqual([0, 2]);
  });

  it('tells the window about the files a few times a second, with the first and the last always', async () => {
    Array.from({ length: 50 }, (_, index) => fs.writeFileSync(path.join(root, `${index}.mp3`), 'not audio'));

    await scanFolder(root, sender);

    const progress = scanningFiles().map((file) => file.progress);
    expect(progress.length).toBeLessThan(50);
    expect([progress[0], progress.at(-1)]).toEqual([0, 49]);
  });

  it('names the folder at once, before the files are listed', async () => {
    await scanFolder(root, sender);

    expect(send).toHaveBeenCalledWith('SCANNING_FOLDER', { folder: root });
  });

  it('ends without an error, and stores nothing more, when its folder is removed from the library', async () => {
    ['a.mp3', 'b.mp3', 'c.mp3'].forEach((name) => fs.writeFileSync(path.join(root, name), 'not audio'));
    send.mockImplementation((channel) => channel === 'SCANNING_FILE' && cancelScansInside(root));

    await expect(scanFolder(root, sender)).resolves.toBe(0);

    expect(scanningFiles()).toHaveLength(1);
  });

  it('finds the audio files of nested folders', async () => {
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'deep.ogg'), 'not audio');
    fs.writeFileSync(path.join(root, 'top.wav'), 'not audio');

    await scanFolder(root, sender);

    expect(scanningFiles().map((file) => path.basename(file.fileName))).toEqual(['deep.ogg', 'top.wav']);
  });

  it('reads one folder at a time', async () => {
    ['a', 'b', 'c'].forEach((name) => {
      fs.mkdirSync(path.join(root, name));
      fs.writeFileSync(path.join(root, name, `${name}.mp3`), 'not audio');
    });
    const readdir = fs.promises.readdir.bind(fs.promises);
    let running = 0;
    let most = 0;
    vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: Parameters<typeof readdir>) => {
      running += 1;
      most = Math.max(most, running);
      try {
        return await readdir(...args);
      } finally {
        running -= 1;
      }
    });

    await scanFolder(root, sender);

    expect(most).toBe(1);
  });

  describe('storing in batches', () => {
    const storedPaths = () => getTracksInside(database, root, ['path']).then((tracks) => tracks.map((track) => path.basename(track.path)).sort());
    const writeFiles = (count: number) => Array.from({ length: count }, (_, index) => fs.writeFileSync(path.join(root, `${index}.mp3`), 'not audio'));

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('stores every track, the ones left after the last full batch too', async () => {
      vi.stubEnv('TUNELLE_SCAN_BATCH_SIZE', '2');
      writeFiles(5);

      await scanFolder(root, sender);

      expect(await storedPaths()).toEqual(['0.mp3', '1.mp3', '2.mp3', '3.mp3', '4.mp3']);
    });

    it('tells the window about the stored tracks while the scan goes on, at most every two seconds', async () => {
      vi.stubEnv('TUNELLE_SCAN_BATCH_SIZE', '2');
      vi.useFakeTimers({ toFake: ['Date'] });
      writeFiles(5);
      const updates = () => send.mock.calls.filter(([channel]) => channel === 'LIBRARY_UPDATED').length;

      await scanFolder(root, sender);
      // three batches within the second: one message
      expect(updates()).toBe(1);

      send.mockClear();
      // files the first scan did not read, as a rescan skips the ones it did
      Array.from({ length: 5 }, (_, index) => fs.writeFileSync(path.join(root, `later-${index}.mp3`), 'not audio'));
      send.mockImplementation((channel) => channel === 'SCANNING_FILE' && vi.advanceTimersByTime(2500));
      await scanFolder(root, sender);
      expect(updates()).toBe(3);
      vi.useRealTimers();
    });

    it('does not give a removed folder the tracks of its last batch back', async () => {
      vi.stubEnv('TUNELLE_SCAN_BATCH_SIZE', '100');
      writeFiles(3);
      send.mockImplementation((channel) => channel === 'SCANNING_FILE' && cancelScansInside(root));

      await scanFolder(root, sender);

      expect(await storedPaths()).toEqual([]);
    });

    it('stores the tracks one by one when a batch cannot be stored, and logs it', async () => {
      vi.stubEnv('TUNELLE_SCAN_BATCH_SIZE', '2');
      writeFiles(2);
      const all = database.all.bind(database);
      let failed = false;
      // the first insert is the batch of both
      vi.spyOn(database, 'all').mockImplementation((query: string, variables: unknown, callback: (error: Error | null, rows: unknown[]) => void) => {
        if (failed || !query.startsWith('INSERT')) return all(query, variables, callback);
        failed = true;
        callback(new Error('disk full'), []);
        return database;
      });

      await scanFolder(root, sender);

      expect(await storedPaths()).toEqual(['0.mp3', '1.mp3']);
      expect(console.error).toHaveBeenCalledWith('Storing a batch of tracks failed, storing them one by one', 'disk full');
    });
  });
});
