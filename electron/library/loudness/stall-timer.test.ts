import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStallTimer } from './stall-timer';

describe('createStallTimer', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('stalls when nothing happens for its time', () => {
    const onStall = vi.fn();
    createStallTimer(1000, onStall);

    vi.advanceTimersByTime(999);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('starts its time again at each touch, however long the job takes in all', () => {
    const onStall = vi.fn();
    const timer = createStallTimer(1000, onStall);

    Array.from({ length: 20 }).forEach(() => {
      vi.advanceTimersByTime(900);
      timer.touch();
    });

    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('does not stall once it is stopped', () => {
    const onStall = vi.fn();
    createStallTimer(1000, onStall).stop();

    vi.advanceTimersByTime(5000);

    expect(onStall).not.toHaveBeenCalled();
  });
});
