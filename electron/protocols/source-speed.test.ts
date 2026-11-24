import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from 'fs/promises';
import { slowAfterMs } from './decode-policy';
import { sourceSpeed } from './source-speed';

vi.mock('fs/promises', () => ({ open: vi.fn() }));

/** A source whose first read answers after `delay` ms, on fake timers */
const answersAfter = (delay: number) =>
  vi.mocked(open).mockResolvedValue({
    read: () => new Promise((resolve) => setTimeout(() => resolve({ bytesRead: 1 }), delay)),
    close: async () => undefined,
  } as unknown as Awaited<ReturnType<typeof open>>);

const measure = async (volume: number) => {
  const speed = sourceSpeed('/music/a.flac', volume);
  await vi.advanceTimersByTimeAsync(10_000);
  return speed;
};

describe('sourceSpeed', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] }));
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(open).mockReset();
  });

  it('calls a source that answers at once fast', async () => {
    answersAfter(1);
    await expect(measure(1)).resolves.toBe('fast');
  });

  it('calls a source that answers late slow', async () => {
    answersAfter(slowAfterMs + 100);
    await expect(measure(2)).resolves.toBe('slow');
  });

  it('measures a volume once and keeps the result for its other files', async () => {
    answersAfter(slowAfterMs + 100);
    await measure(3);
    answersAfter(1);
    await expect(measure(3)).resolves.toBe('slow');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('measures another volume on its own', async () => {
    answersAfter(slowAfterMs + 100);
    await measure(4);
    answersAfter(1);
    await expect(measure(5)).resolves.toBe('fast');
  });

  it('counts a file that can not be read as slow', async () => {
    vi.mocked(open).mockRejectedValue(new Error('gone'));
    await expect(measure(6)).resolves.toBe('slow');
  });
});
