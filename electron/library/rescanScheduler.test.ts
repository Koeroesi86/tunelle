import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRescanScheduler } from './rescanScheduler';

const change = (path: string, deep = false) => ({ path, deep });

describe('createRescanScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('scans once after a quiet time, however many changes came', async () => {
    const run = vi.fn(async () => undefined);
    const { schedule } = createRescanScheduler(run, 1000);

    schedule([change('/music/a')]);
    await vi.advanceTimersByTimeAsync(900);
    schedule([change('/music/a'), change('/music/b')]);
    schedule([change('/radio', true)]);
    await vi.advanceTimersByTimeAsync(900);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledExactlyOnceWith([change('/music/a'), change('/music/b'), change('/radio', true)]);
  });

  it('scans a change that came during a scan after it, never two at once', async () => {
    let finish = () => {};
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { schedule } = createRescanScheduler(run, 1000);

    schedule([change('/music')]);
    await vi.advanceTimersByTimeAsync(1000);
    schedule([change('/radio')]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledExactlyOnceWith([change('/music')]);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenLastCalledWith([change('/radio')]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('goes on after a scan that failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(undefined);
    const { schedule } = createRescanScheduler(run, 1000);

    schedule([change('/music')]);
    await vi.advanceTimersByTimeAsync(1000);
    schedule([change('/music')]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('drops what is waiting when it is cancelled', async () => {
    const run = vi.fn(async () => undefined);
    const { schedule, cancel } = createRescanScheduler(run, 1000);

    schedule([change('/music')]);
    cancel();
    await vi.advanceTimersByTimeAsync(5000);

    expect(run).not.toHaveBeenCalled();
  });
});
