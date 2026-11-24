import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slowAfterMs } from './decode-policy';
import { sourceSpeed } from './source-speed';

const { open } = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('fs/promises', () => ({ open }));

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

/** A source whose first read answers after `delay` ms, on fake timers */
const answersAfter = (delay: number) => open.mockResolvedValue({ read: () => wait(delay).then(() => ({ bytesRead: 1 })), close: async () => undefined });

/** A source whose file takes `delay` ms to open, as on a network mount, and whose read is at once */
const opensAfter = (delay: number) =>
  open.mockImplementation(() => wait(delay).then(() => ({ read: async () => ({ bytesRead: 1 }), close: async () => undefined })));

const measure = async (volume: number) => {
  const speed = sourceSpeed('/music/a.flac', volume);
  await vi.advanceTimersByTimeAsync(10_000);
  return speed;
};

describe('sourceSpeed', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] }));
  afterEach(() => {
    vi.useRealTimers();
    open.mockReset();
  });

  it('calls a source that answers at once fast', async () => {
    answersAfter(1);
    await expect(measure(1)).resolves.toBe('fast');
  });

  it('calls a source that answers late slow', async () => {
    answersAfter(slowAfterMs + 100);
    await expect(measure(2)).resolves.toBe('slow');
  });

  it('counts the time the file takes to open, as a network mount is slow there', async () => {
    opensAfter(slowAfterMs + 100);
    await expect(measure(7)).resolves.toBe('slow');
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
    open.mockRejectedValue(new Error('gone'));
    await expect(measure(6)).resolves.toBe('slow');
  });
});
