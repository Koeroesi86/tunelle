import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    list.mockImplementation(async (_mount: string, directory: string) => tree[directory]);

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

describe('the wait between two looks', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is a hundred times the look, between the least wait and fifteen minutes', () => {
    vi.mocked(savingPower).mockReturnValue(false);

    expect(pollInterval(1)).toBe(10_000);
    expect(pollInterval(500)).toBe(50_000);
    expect(pollInterval(1_000_000)).toBe(15 * 60_000);
  });

  it('takes the least wait from the environment, and the default for what is no number of seconds', () => {
    vi.mocked(savingPower).mockReturnValue(false);
    vi.stubEnv('TUNELLE_WATCH_MIN_SECONDS', '30');
    expect(pollInterval(1)).toBe(30_000);

    vi.stubEnv('TUNELLE_WATCH_MIN_SECONDS', 'soon');
    expect(pollInterval(1)).toBe(10_000);
  });

  it('is longer while the computer saves power', () => {
    vi.mocked(savingPower).mockReturnValue(false);
    const normal = pollInterval(1);
    vi.mocked(savingPower).mockReturnValue(true);

    expect(pollInterval(1)).toBeGreaterThan(normal);
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
    watcher.close();
  });

  it('does not keep a folder that does not answer at the start, and tries it again with the next update', async () => {
    const watcher = create();
    readTimes.mockResolvedValue(times([]));
    await watcher.update(['/m']);
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
