import { describe, expect, it } from 'vitest';
import { createGate, Dropped } from './request-gate';

const deferred = () => {
  let finish: (value: string) => void = () => undefined;
  const promise = new Promise<string>((resolve) => (finish = resolve));
  return { promise, finish };
};

describe('createGate', () => {
  it('runs as many tasks of a key as the limit and the rest as they finish', async () => {
    const gate = createGate(2);
    const started: number[] = [];
    const tasks = [deferred(), deferred(), deferred()];
    const results = tasks.map((task, index) =>
      gate('a', () => {
        started.push(index);
        return task.promise;
      })
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    tasks[0].finish('x');
    await results[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    tasks[1].finish('y');
    tasks[2].finish('z');
    expect(await Promise.all(results)).toEqual(['x', 'y', 'z']);
  });

  it('keeps the keys apart, and frees the place of a task that failed', async () => {
    const gate = createGate(1);
    const blocked = deferred();
    const first = gate('a', () => blocked.promise);
    const other = await gate('b', () => Promise.resolve('b'));
    const failed = gate('a', () => Promise.reject(new Error('no')));
    const after = gate('a', () => Promise.resolve('after'));

    blocked.finish('first');
    await first;

    await expect(failed).rejects.toThrow('no');
    expect(other).toBe('b');
    expect(await after).toBe('after');
  });

  it('drops the waiting tasks that the test names, and lets the running and the others finish', async () => {
    const gate = createGate(1);
    const running = deferred();
    const first = gate('a', () => running.promise, 'first');
    const dropped = gate('a', () => Promise.resolve('dropped'), 'old');
    const kept = gate('a', () => Promise.resolve('kept'), 'new');
    const outcome = dropped.catch((error) => error);

    expect(gate.drop('a', (tag) => tag !== 'new')).toEqual(['old']);
    expect(gate.drop('unknown', () => true)).toEqual([]);
    running.finish('first');

    expect(await outcome).toBeInstanceOf(Dropped);
    expect(await first).toBe('first');
    expect(await kept).toBe('kept');
  });
});
