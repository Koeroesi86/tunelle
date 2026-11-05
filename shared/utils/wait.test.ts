import { afterEach, describe, expect, it, vi } from 'vitest';
import { wait } from './wait';

describe('wait', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves after the time on fake timers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const done = vi.fn();
    wait(500).then(done);

    await vi.advanceTimersByTimeAsync(499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });
});
