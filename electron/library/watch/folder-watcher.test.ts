import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { mountGuard } from '../mounts/mount-guard';
import { savingPower } from '../../power/power-state';
import { logError } from '../../utils/log-error';
import { createFolderWatcher, pollInterval, readDirectoryTimes } from './folder-watcher';

vi.mock('../mounts/mount-guard', () => ({ mountGuard: vi.fn() }));
vi.mock('../../power/power-state', () => ({ savingPower: vi.fn() }));
vi.mock('../../utils/log-error', () => ({ logError: vi.fn() }));

describe('reading the times of the folders', () => {
  const list = vi.fn();

  beforeEach(() => {
    list.mockReset();
    vi.mocked(mountGuard).mockReturnValue({ list } as unknown as ReturnType<typeof mountGuard>);
  });

  it('reads the folder and the folders below it, each by the process of the mount', async () => {
    const tree: Record<string, { time: number; directories: string[] }> = {
      '/m': { time: 1, directories: ['a', 'b'] },
      '/m/a': { time: 2, directories: ['c'] },
      '/m/b': { time: 3, directories: [] },
      '/m/a/c': { time: 4, directories: [] },
    };
    list.mockImplementation(async (_mount: string, directory: string) => tree[directory.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/')]);

    const times = await readDirectoryTimes('/m');

    expect([...times].map(([directory, time]) => [directory.replaceAll('\\', '/'), time])).toEqual([
      ['/m', 1],
      ['/m/a', 2],
      ['/m/b', 3],
      ['/m/a/c', 4],
    ]);
    expect(list).toHaveBeenCalledWith('/m', '/m');
  });

  it('leaves out a folder that does not answer, and what was below it', async () => {
    list.mockImplementation(async (_mount: string, directory: string) => (directory === '/m' ? { time: 1, directories: ['a'] } : {}));

    expect([...(await readDirectoryTimes('/m'))]).toEqual([['/m', 1]]);
  });

  it('gives no times for a folder that does not answer at all', async () => {
    list.mockResolvedValue({});

    expect((await readDirectoryTimes('/m')).size).toBe(0);
  });
});

describe('pollInterval', () => {
  beforeEach(() => vi.mocked(savingPower).mockReturnValue(false));

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

describe('pollInterval while power is saved', () => {
  afterEach(() => {
    vi.mocked(savingPower).mockReturnValue(false);
    vi.unstubAllEnvs();
  });

  it.each([
    [0.2, 40_000],
    [500, 200_000],
    [1000, 400_000],
    [20_000, 60 * 60_000],
  ])('waits after a look that took %s ms for %s ms, four times as long', (lookMs, expected) => {
    vi.mocked(savingPower).mockReturnValue(true);

    expect(pollInterval(lookMs)).toBe(expected);
  });

  it('multiplies the shortest wait that TUNELLE_WATCH_MIN_SECONDS sets too', () => {
    vi.stubEnv('TUNELLE_WATCH_MIN_SECONDS', '2');
    vi.mocked(savingPower).mockReturnValue(true);

    expect(pollInterval(0.2)).toBe(8000);
  });

  it('goes back to the normal waits when power is not saved any more', () => {
    vi.mocked(savingPower).mockReturnValue(true);
    expect(pollInterval(0.2)).toBe(40_000);

    vi.mocked(savingPower).mockReturnValue(false);
    expect(pollInterval(0.2)).toBe(10_000);
  });
});

describe('the folder watcher', () => {
  const onChange = vi.fn();
  const times = (entries: [string, number][]) => new Map(entries);
  const readTimes = vi.fn();
  const create = (checkGap = 30_000) => createFolderWatcher(onChange, { readTimes, interval: () => 1000, checkGap });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] });
    vi.setSystemTime(100_000);
    onChange.mockReset();
    readTimes.mockReset().mockResolvedValue(times([['/m', 1]]));
    vi.mocked(logError).mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('tells which folders changed or are new, and which are gone with what was below them', async () => {
    const watcher = create();
    await watcher.update(['/m']);
    readTimes.mockResolvedValue(
      times([
        ['/m', 2],
        ['/m/new', 5],
      ])
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledWith([
      { path: '/m', deep: false },
      { path: '/m/new', deep: false },
    ]);

    readTimes.mockResolvedValue(times([['/m', 2]]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenLastCalledWith([{ path: '/m/new', deep: true }]);
    watcher.close();
  });

  it('tells nothing when nothing changed, and keeps what it saw of a folder that does not answer', async () => {
    const watcher = create();
    await watcher.update(['/m']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();

    readTimes.mockResolvedValue(times([]));
    await vi.advanceTimersByTimeAsync(1000);
    readTimes.mockResolvedValue(times([['/m', 1]]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(readTimes).toHaveBeenCalledTimes(4);
    watcher.close();
  });

  it('does not keep a folder that does not answer at the start, and tries it again with the next update', async () => {
    const watcher = create();
    readTimes.mockResolvedValue(times([]));
    await watcher.update(['/m']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(readTimes).toHaveBeenCalledOnce();
    readTimes.mockResolvedValue(times([['/m', 1]]));
    await watcher.update(['/m']);
    readTimes.mockResolvedValue(times([['/m', 9]]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(onChange).toHaveBeenCalledWith([{ path: '/m', deep: false }]);
    watcher.close();
  });

  it('stops looking at a folder that is not kept any more', async () => {
    const watcher = create();
    await watcher.update(['/m']);
    await watcher.update([]);
    readTimes.mockClear();

    await vi.advanceTimersByTimeAsync(5000);

    expect(readTimes).not.toHaveBeenCalled();
  });

  it('looks at once when asked, but not again within the gap, unless forced', async () => {
    const watcher = create();
    await watcher.update(['/m']);
    readTimes.mockClear().mockResolvedValue(times([['/m', 2]]));

    await watcher.check();
    await watcher.check();
    expect(readTimes).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    await watcher.check(true);
    expect(readTimes).toHaveBeenCalledTimes(2);
    watcher.close();
  });

  it('does not look at a folder twice at once', async () => {
    const watcher = create();
    await watcher.update(['/m']);
    let finish: (value: Map<string, number>) => void = () => undefined;
    readTimes.mockClear().mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const first = watcher.check(true);
    await watcher.check(true);
    finish(times([['/m', 1]]));
    await first;

    expect(readTimes).toHaveBeenCalledTimes(1);
    watcher.close();
  });

  it('stops for good when closed, also for a folder that was being read', async () => {
    const watcher = create();
    await watcher.update(['/m']);
    watcher.close();
    readTimes.mockClear();

    await vi.advanceTimersByTimeAsync(5000);
    await watcher.update(['/other']);

    expect(readTimes).toHaveBeenCalledTimes(1);
  });

  it('logs a failed update', async () => {
    const watcher = create();
    readTimes.mockRejectedValue(new Error('broken'));

    await watcher.update(['/m']);

    expect(logError).toHaveBeenCalled();
  });
});

describe('the looks of the folder watcher', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] }));
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
});
