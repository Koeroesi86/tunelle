import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage } from './error-message';
import { isRecord } from './is-record';
import { wait } from './wait';

describe('shared utils', () => {
  afterEach(() => vi.useRealTimers());

  it('isRecord accepts objects and arrays, not null or text', () => {
    expect([{}, [], null, 'a', undefined].map(isRecord)).toEqual([true, true, false, false, false]);
  });

  it('errorMessage reads an Error and prints anything else', () => {
    expect([new Error('boom'), 'plain', 4].map(errorMessage)).toEqual(['boom', 'plain', '4']);
  });

  it('wait resolves after the time on fake timers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const done = vi.fn();
    wait(500).then(done);

    await vi.advanceTimersByTimeAsync(499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });
});
