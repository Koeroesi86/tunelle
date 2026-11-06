import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapAsync } from './map-async';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pause = () => wait(1);

/** The time goes by as the tasks ask for it, with no real wait */
const settle = <T>(promise: Promise<T>) => vi.runAllTimersAsync().then(() => promise);

const track = () => {
  let inFlight = 0;
  let most = 0;
  const task = async (item: number) => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    await pause();
    inFlight -= 1;
    return item * 2;
  };

  return { task, most: () => most };
};

describe('mapAsync', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('keeps the order of the items', async () => {
    expect(await mapAsync([1, 2, 3, 4, 5], async (item) => item * 2, { concurrency: 3 })).toEqual([2, 4, 6, 8, 10]);
  });

  it('runs one task at a time by default', async () => {
    const { task, most } = track();

    await settle(mapAsync([1, 2, 3, 4], task));

    expect(most()).toBe(1);
  });

  it('has no more tasks in flight than the concurrency', async () => {
    const { task, most } = track();

    await settle(mapAsync([1, 2, 3, 4, 5, 6, 7], task, { concurrency: 3 }));

    expect(most()).toBe(3);
  });

  it('does not run more tasks than there are items', async () => {
    const { task, most } = track();

    await settle(mapAsync([1, 2], task, { concurrency: 10 }));

    expect(most()).toBe(2);
  });

  it('starts a round only when the one before it has finished', async () => {
    const events: string[] = [];
    const task = async (item: number) => {
      events.push(`start ${item}`);
      await wait(item === 1 ? 20 : 1);
      events.push(`end ${item}`);
    };

    await settle(mapAsync([1, 2, 3], task, { concurrency: 2 }));

    expect(events).toEqual(['start 1', 'start 2', 'end 2', 'end 1', 'start 3', 'end 3']);
  });

  it('treats a concurrency below 1 as 1', async () => {
    const { task, most } = track();

    await settle(mapAsync([1, 2, 3], task, { concurrency: 0 }));

    expect(most()).toBe(1);
  });

  it('gives the task the index of the item', async () => {
    expect(await mapAsync(['a', 'b'], async (item, index) => `${item}${index}`)).toEqual(['a0', 'b1']);
  });

  it('is empty for nothing', async () => {
    expect(await mapAsync([], async (item) => item, { concurrency: 3 })).toEqual([]);
  });

  it('stops at the first failure and throws that error', async () => {
    const task = vi.fn(async (item: number) => {
      if (item === 2) throw new Error('failed on 2');
      return item;
    });

    await expect(mapAsync([1, 2, 3, 4], task)).rejects.toThrow('failed on 2');
    expect(task).toHaveBeenCalledTimes(2);
  });
});
