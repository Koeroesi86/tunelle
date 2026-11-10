import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createFolderWatcher, pollInterval, readDirectoryTimes } from './folder-watcher';

describe('pollInterval', () => {
  it.each([
    [0.2, 10_000],
    [100, 10_000],
    [500, 50_000],
    [1000, 100_000],
    [4000, 400_000],
    [20_000, 15 * 60_000],
  ])('waits after a look that took %s ms for %s ms', (lookMs, expected) => {
    expect(pollInterval(lookMs)).toBe(expected);
  });

  it('takes the shortest wait from TUNELLE_WATCH_MIN_SECONDS, and the default for a value that is not a number of seconds', () => {
    vi.stubEnv('TUNELLE_WATCH_MIN_SECONDS', '1');
    expect(pollInterval(0.2)).toBe(1000);
    vi.stubEnv('TUNELLE_WATCH_MIN_SECONDS', 'soon');
    expect(pollInterval(0.2)).toBe(10_000);
    vi.unstubAllEnvs();
  });
});

describe('createFolderWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** The folders and what is below them: a number of folders each, with the modification time of the last look */
  const setup = (directories: Record<string, number> = { '/music': 3, '/radio': 2 }, options: { checkGap?: number; lookMs?: Record<string, number> } = {}) => {
    const modified = new Map<string, number>();
    // a look takes the time of the folder on the fake clock
    const readTimes = vi.fn(async (folder: string) => {
      vi.advanceTimersByTime(options.lookMs?.[folder] ?? 1);
      return new Map(Array.from({ length: directories[folder] ?? 0 }, (_, index) => [`${folder}/${index}`, modified.get(folder) ?? 1]));
    });
    const interval = vi.fn((lookMs: number) => lookMs * 1000);
    const onChange = vi.fn();
    const folderWatcher = createFolderWatcher(onChange, { readTimes, interval, checkGap: options.checkGap ?? 0 });
    return { folderWatcher, modified, readTimes, interval, onChange, options };
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

  it('waits for each folder as long as its own look asks for', async () => {
    const { folderWatcher, readTimes } = setup({ '/music': 1, '/nas': 1 }, { lookMs: { '/music': 1, '/nas': 4 } });
    // one after the other: looks at the same time count the time of each other
    await folderWatcher.update(['/music']);
    await folderWatcher.update(['/music', '/nas']);
    readTimes.mockClear();

    await vi.advanceTimersByTimeAsync(1500);
    expect(readTimes.mock.calls.map(([folder]) => folder)).toEqual(['/music']);

    await vi.advanceTimersByTimeAsync(3000);
    const looked = readTimes.mock.calls.map(([folder]) => folder);
    expect(looked.filter((folder) => folder === '/music')).toHaveLength(4);
    expect(looked.filter((folder) => folder === '/nas')).toHaveLength(1);
    folderWatcher.close();
  });

  it('times every look, so a tree that gets slower is looked at less often', async () => {
    const { folderWatcher, options, readTimes } = setup({ '/nas': 1 }, { lookMs: { '/nas': 1 } });
    await folderWatcher.update(['/nas']);
    Object.assign(options.lookMs ?? {}, { '/nas': 5 });
    await vi.advanceTimersByTimeAsync(1100);
    readTimes.mockClear();

    await vi.advanceTimersByTimeAsync(4000);
    expect(readTimes).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(readTimes).toHaveBeenCalledOnce();
    folderWatcher.close();
  });

  it('goes by the longer of the last two looks, so one quick look does not shorten the wait', async () => {
    const { folderWatcher, options, interval } = setup({ '/nas': 1 }, { lookMs: { '/nas': 5 } });
    await folderWatcher.update(['/nas']);
    Object.assign(options.lookMs ?? {}, { '/nas': 1 });
    await vi.advanceTimersByTimeAsync(5100);

    expect(interval).toHaveBeenLastCalledWith(5);
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
    const watching = createFolderWatcher(onChange, { readTimes, interval: () => 1000, checkGap: 0 });
    await watching.update(['/music']);

    await vi.advanceTimersByTimeAsync(1000);

    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { path: '/music/c', deep: false },
      { path: '/music/b', deep: true },
    ]);
    watching.close();
  });

  it('does not look again within the gap that was set', async () => {
    const { folderWatcher, readTimes } = setup({ '/music': 3 }, { checkGap: 30_000, lookMs: { '/music': 1000 } });
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
    const { folderWatcher, readTimes } = setup();
    let answer: (times: Map<string, number>) => void = () => undefined;
    readTimes.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const updated = folderWatcher.update(['/music']);
    await vi.advanceTimersByTimeAsync(0);
    folderWatcher.close();
    answer(new Map([['/music/0', 1]]));
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
