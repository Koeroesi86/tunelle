import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createFolderWatcher, measureResponse, pollInterval, readDirectoryTimes } from './folderWatcher';

describe('pollInterval', () => {
  it.each([
    [0.2, 30_000],
    [10, 30_000],
    [50, 100_000],
    [200, 400_000],
    [5000, 15 * 60_000],
  ])('waits for a folder that answers in %s ms %s ms', (responseMs, expected) => {
    expect(pollInterval(responseMs)).toBe(expected);
  });
});

describe('measureResponse', () => {
  it('takes the time a folder needs to answer', async () => {
    expect(await measureResponse(os.tmpdir())).toBeGreaterThanOrEqual(0);
  });

  it('takes a folder that is not there as answered', async () => {
    expect(await measureResponse(path.join(os.tmpdir(), 'tunelle-not-there'))).toBeGreaterThanOrEqual(0);
  });
});

describe('createFolderWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** The folders and what is below them: a number of folders each, with the modification time of the last look */
  const setup = (
    directories: Record<string, number> = { '/music': 3, '/radio': 2 },
    options: { checkGap?: number; responseMs?: Record<string, number> } = {}
  ) => {
    const modified = new Map<string, number>();
    const readTimes = vi.fn(
      async (folder: string) => new Map(Array.from({ length: directories[folder] ?? 0 }, (_, index) => [`${folder}/${index}`, modified.get(folder) ?? 1]))
    );
    const measure = vi.fn(async (folder: string) => options.responseMs?.[folder] ?? 1);
    const interval = vi.fn((responseMs: number) => responseMs * 1000);
    const onChange = vi.fn();
    const folderWatcher = createFolderWatcher(onChange, { readTimes, measure, interval, checkGap: options.checkGap ?? 0 });
    return { folderWatcher, modified, readTimes, measure, interval, onChange };
  };

  /** The folders of the fake look of a folder, all with another time */
  const folders = (folder: string, count: number) => Array.from({ length: count }, (_, index) => ({ path: `${folder}/${index}`, deep: false }));

  it('reports the folders that changed between two looks, and only once', async () => {
    const { folderWatcher, modified, onChange } = setup();
    await folderWatcher.update(['/music']);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();

    modified.set('/music', 2);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onChange).toHaveBeenCalledExactlyOnceWith(folders('/music', 3));
    folderWatcher.close();
  });

  it('does not use a watch of the system', async () => {
    const watch = vi.spyOn(fs, 'watch');
    const { folderWatcher } = setup();

    await folderWatcher.update(['/music', '/radio']);

    expect(watch).not.toHaveBeenCalled();
    folderWatcher.close();
  });

  it('waits for each folder as long as its own answer asks for', async () => {
    const { folderWatcher, readTimes } = setup({ '/music': 1, '/nas': 1 }, { responseMs: { '/music': 1, '/nas': 4 } });
    await folderWatcher.update(['/music', '/nas']);
    readTimes.mockClear();

    await vi.advanceTimersByTimeAsync(1000);
    expect(readTimes.mock.calls.map(([folder]) => folder)).toEqual(['/music']);

    await vi.advanceTimersByTimeAsync(3000);
    const looked = readTimes.mock.calls.map(([folder]) => folder);
    expect(looked.filter((folder) => folder === '/music')).toHaveLength(4);
    expect(looked.filter((folder) => folder === '/nas')).toHaveLength(1);
    folderWatcher.close();
  });

  it('measures the answer again at every look, so a drive that slows down is looked at less often', async () => {
    const { folderWatcher, measure, readTimes } = setup({ '/nas': 1 });
    await folderWatcher.update(['/nas']);
    measure.mockResolvedValue(5);
    await vi.advanceTimersByTimeAsync(1000);
    readTimes.mockClear();

    await vi.advanceTimersByTimeAsync(4000);
    expect(readTimes).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(readTimes).toHaveBeenCalledOnce();
    folderWatcher.close();
  });

  it('keeps what it watches and starts what is new, and stops what is gone', async () => {
    const { folderWatcher, readTimes } = setup({ '/music': 1, '/radio': 1, '/usb': 1 });
    await folderWatcher.update(['/music', '/radio']);
    await folderWatcher.update(['/radio', '/usb']);
    readTimes.mockClear();

    await vi.advanceTimersByTimeAsync(1000);

    expect(readTimes.mock.calls.map(([folder]) => folder).sort()).toEqual(['/radio', '/usb']);
    folderWatcher.close();
  });

  it('reports a folder that is gone as deep, and one that is new for its own files', async () => {
    const times = [
      new Map([
        ['/music/a', 1],
        ['/music/b', 1],
      ]),
      new Map([
        ['/music/a', 1],
        ['/music/c', 1],
      ]),
    ];
    const readTimes = vi.fn(
      async () =>
        times.shift() ??
        new Map([
          ['/music/a', 1],
          ['/music/c', 1],
        ])
    );
    const onChange = vi.fn();
    const watching = createFolderWatcher(onChange, { readTimes, measure: async () => 1, interval: () => 1000, checkGap: 0 });
    await watching.update(['/music']);

    await vi.advanceTimersByTimeAsync(1000);

    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { path: '/music/c', deep: false },
      { path: '/music/b', deep: true },
    ]);
    watching.close();
  });

  it('does not look again within the gap that was set', async () => {
    const { folderWatcher, readTimes } = setup({ '/music': 3 }, { checkGap: 30_000, responseMs: { '/music': 10_000 } });
    await folderWatcher.update(['/music']);
    readTimes.mockClear();

    await folderWatcher.check();
    await folderWatcher.check();
    await vi.advanceTimersByTimeAsync(30_000);
    await folderWatcher.check();

    expect(readTimes).toHaveBeenCalledTimes(2);
    folderWatcher.close();
  });

  it('looks when asked, and then waits as long as the answer asks for from there', async () => {
    const { folderWatcher, modified, readTimes, onChange } = setup({ '/music': 1 });
    await folderWatcher.update(['/music']);
    await vi.advanceTimersByTimeAsync(500);
    modified.set('/music', 2);
    readTimes.mockClear();

    await folderWatcher.check();
    expect(onChange).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600);

    expect(readTimes).toHaveBeenCalledTimes(1);
    folderWatcher.close();
  });

  it('does not start a look while the last one goes on', async () => {
    const { folderWatcher, readTimes } = setup({ '/music': 1 });
    await folderWatcher.update(['/music']);
    let finish: () => void = () => undefined;
    readTimes.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve(new Map([['/music/0', 1]])))));
    readTimes.mockClear();

    const first = folderWatcher.check();
    await folderWatcher.check();
    finish();
    await first;

    expect(readTimes).toHaveBeenCalledTimes(1);
    folderWatcher.close();
  });

  it('goes on after a look at a folder that did not answer, without reporting it', async () => {
    const { folderWatcher, readTimes, onChange } = setup({ '/music': 1 });
    await folderWatcher.update(['/music']);
    readTimes.mockResolvedValueOnce(new Map());

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onChange).not.toHaveBeenCalled();
    expect(readTimes).toHaveBeenCalledTimes(3);
    folderWatcher.close();
  });

  it('tries a folder that did not answer again with the next update', async () => {
    const { folderWatcher, readTimes } = setup({ '/music': 0 });
    await folderWatcher.update(['/music']);
    await vi.advanceTimersByTimeAsync(5000);

    expect(readTimes).toHaveBeenCalledOnce();
    await folderWatcher.update(['/music']);
    expect(readTimes).toHaveBeenCalledTimes(2);
    folderWatcher.close();
  });

  it('stops looking on close, also for a look that was waiting for its answer', async () => {
    const { folderWatcher, readTimes, measure } = setup();
    let answer: (ms: number) => void = () => undefined;
    measure.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const updated = folderWatcher.update(['/music']);
    await vi.advanceTimersByTimeAsync(0);
    folderWatcher.close();
    answer(1);
    await updated;
    readTimes.mockClear();
    await vi.advanceTimersByTimeAsync(5000);

    expect(readTimes).not.toHaveBeenCalled();
  });

  it('stops looking when no folder is left', async () => {
    const { folderWatcher, readTimes } = setup();
    await folderWatcher.update(['/music']);
    await folderWatcher.update([]);
    readTimes.mockClear();
    await vi.advanceTimersByTimeAsync(5000);

    expect(readTimes).not.toHaveBeenCalled();
  });
});

describe('with the file system', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-watch-'));
    fs.mkdirSync(path.join(root, 'artist', 'album'), { recursive: true });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('reads the folder and the folders below it, and not the files', async () => {
    fs.writeFileSync(path.join(root, 'artist', 'album', 'one.flac'), '');

    expect([...(await readDirectoryTimes(root)).keys()].sort()).toEqual([root, path.join(root, 'artist'), path.join(root, 'artist', 'album')]);
  });

  it('finds a new file by the modification time of its folder', async () => {
    const album = path.join(root, 'artist', 'album');
    fs.utimesSync(album, 1, 1);
    const before = await readDirectoryTimes(root);
    fs.writeFileSync(path.join(album, 'new.flac'), '');

    expect((await readDirectoryTimes(root)).get(album)).not.toBe(before.get(album));
  });

  it('reads nothing of a folder that is not there', async () => {
    expect((await readDirectoryTimes(path.join(root, 'gone'))).size).toBe(0);
  });

  it('sees a file that is added below the folder', async () => {
    const onChange = vi.fn();
    const folderWatcher = createFolderWatcher(onChange, { interval: () => 20, checkGap: 0 });
    await folderWatcher.update([root]);

    // a file is written until a look sees it
    await vi.waitFor(() => {
      fs.writeFileSync(path.join(root, 'artist', 'album', `${Date.now()}.flac`), '');
      expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining(root) })]));
    });

    folderWatcher.close();
  });
});
