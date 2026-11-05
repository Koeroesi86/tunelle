import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskQueue } from './task-queue';
import type { Task } from './task-queue';

const pause = 1000;

const task = (key: string, priority: number, run: Task['run'] = async () => {}, extra: Partial<Task> = {}): Task => ({
  kind: 'work',
  key,
  priority,
  run,
  ...extra,
});

const deferred = () => {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
};

describe('createTaskQueue', () => {
  let order: string[];
  const record = (name: string) => async () => {
    order.push(name);
  };
  const settle = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(0);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    order = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('the order', () => {
    it('runs the most important task first and the ones of the same priority in the order they came', async () => {
      const queue = createTaskQueue(pause);
      queue.enqueue(task('first', 1, record('first')));
      queue.enqueue(task('second', 1, record('second')));
      queue.enqueue(task('urgent', 5, record('urgent')));
      queue.start();
      await settle();

      expect(order).toEqual(['urgent', 'first', 'second']);
      await queue.stop();
    });

    it('runs one task at a time', async () => {
      const queue = createTaskQueue(pause);
      const first = deferred();
      queue.enqueue(task('a', 1, () => first.promise.then(record('a'))));
      queue.enqueue(task('b', 1, record('b')));
      queue.start();
      await settle();
      expect(order).toEqual([]);

      first.finish();
      await settle();

      expect(order).toEqual(['a', 'b']);
      await queue.stop();
    });

    it('does not interrupt a running task for a more important one, which goes next', async () => {
      const queue = createTaskQueue(pause);
      const running = deferred();
      const signals: boolean[] = [];
      queue.enqueue(task('slow', 1, (signal) => running.promise.then(() => void signals.push(signal.aborted)).then(record('slow'))));
      queue.start();
      await settle();

      queue.enqueue(task('urgent', 9, record('urgent')));
      queue.enqueue(task('later', 1, record('later')));
      await settle();
      expect(order).toEqual([]);

      running.finish();
      await settle();

      expect(order).toEqual(['slow', 'urgent', 'later']);
      expect(signals).toEqual([false]);
      await queue.stop();
    });

    it('replaces the waiting task of a key, and keeps its place', async () => {
      const queue = createTaskQueue(pause);
      queue.enqueue(task('a', 1, record('a')));
      queue.enqueue(task('b', 1, record('old b')));
      queue.enqueue(task('b', 1, record('new b')));
      queue.start();
      await settle();

      expect(order).toEqual(['a', 'new b']);
      await queue.stop();
    });
  });

  describe('what may run', () => {
    it('lets the tasks behind a task that may not run go, and runs it when it may', async () => {
      const queue = createTaskQueue(pause);
      let allowed = false;
      queue.enqueue(task('blocked', 9, record('blocked'), { canRun: () => allowed }));
      queue.enqueue(task('free', 1, record('free')));
      queue.start();
      await settle();
      expect(order).toEqual(['free']);

      allowed = true;
      await vi.advanceTimersByTimeAsync(pause);

      expect(order).toEqual(['free', 'blocked']);
      await queue.stop();
    });

    it('waits for the pause between two looks, and a new task does not wait for it', async () => {
      const queue = createTaskQueue(pause);
      queue.start();
      await settle();

      queue.enqueue(task('now', 1, record('now')));
      await settle();

      expect(order).toEqual(['now']);
      await queue.stop();
    });

    it('goes on after a task that fails, and after a condition that fails', async () => {
      const queue = createTaskQueue(pause);
      queue.enqueue(task('broken', 9, () => Promise.reject(new Error('failed'))));
      queue.enqueue(task('unsure', 5, record('unsure'), { canRun: () => Promise.reject(new Error('unsure')) }));
      queue.enqueue(task('fine', 1, record('fine')));
      queue.start();
      await settle();

      expect(order).toEqual(['fine']);
      expect(console.error).toHaveBeenCalledWith(new Error('failed'));
      expect(console.error).toHaveBeenCalledWith(new Error('unsure'));
      await queue.stop();
    });
  });

  describe('sources', () => {
    const supply = (names: string[], extra: Partial<Parameters<ReturnType<typeof createTaskQueue>['addSource']>[0]> = {}) => ({
      kind: 'supply',
      priority: 1,
      next: async () => {
        const name = names.shift();
        return name === undefined ? undefined : { key: name, run: record(name) };
      },
      ...extra,
    });

    it('is asked for tasks until it has none, and again after the pause', async () => {
      const queue = createTaskQueue(pause);
      const names = ['a', 'b'];
      queue.addSource(supply(names));
      queue.start();
      await settle();
      expect(order).toEqual(['a', 'b']);

      names.push('c');
      await vi.advanceTimersByTimeAsync(pause);

      expect(order).toEqual(['a', 'b', 'c']);
      await queue.stop();
    });

    it('is asked after the queued tasks of the same priority, and before the queued ones of a lower priority only when it is more important', async () => {
      const queue = createTaskQueue(pause);
      queue.enqueue(task('queued', 1, record('queued')));
      queue.enqueue(task('low', 0, record('low')));
      queue.addSource(supply(['sourced']));
      queue.start();
      await settle();

      expect(order).toEqual(['queued', 'sourced', 'low']);
      await queue.stop();
    });

    it('is not asked while it may not run, and is taken away', async () => {
      const queue = createTaskQueue(pause);
      let allowed = false;
      const next = vi.fn().mockResolvedValue(undefined);
      const remove = queue.addSource({ kind: 'supply', priority: 1, canRun: () => allowed, next });
      queue.start();
      await settle();
      expect(next).not.toHaveBeenCalled();

      allowed = true;
      await vi.advanceTimersByTimeAsync(pause);
      expect(next).toHaveBeenCalledTimes(1);

      remove();
      await vi.advanceTimersByTimeAsync(pause * 3);
      expect(next).toHaveBeenCalledTimes(1);
      await queue.stop();
    });

    it('hands its kind and priority to the tasks it gives', async () => {
      const queue = createTaskQueue(pause);
      const during: boolean[] = [];
      const tasks = [{ key: 'a', run: async () => void during.push(queue.isBusy('analyse')) }];
      queue.addSource({ kind: 'analyse', priority: 1, next: async () => tasks.shift() });
      queue.start();
      await settle();

      expect(during[0]).toBe(true);
      await queue.stop();
    });
  });

  describe('what is going on', () => {
    it('is busy with a kind while a task of it runs, and idle from the time it ended', async () => {
      const queue = createTaskQueue(pause);
      const running = deferred();
      queue.enqueue(task('a', 1, () => running.promise, { kind: 'scan' }));
      queue.start();
      await settle();
      expect(queue.isBusy('scan')).toBe(true);
      expect(queue.idleFor('scan')).toBe(0);

      running.finish();
      await settle();
      vi.setSystemTime(5000);

      expect(queue.isBusy('scan')).toBe(false);
      expect(queue.idleFor('scan')).toBe(5000);
      await queue.stop();
    });

    it('counts the idle time of a kind that was never busy from the start of the queue', () => {
      const queue = createTaskQueue(pause);
      vi.setSystemTime(7000);

      expect(queue.idleFor('scan')).toBe(7000);
    });

    it('is busy with work that runs outside of it until all of it has ended, and an end counts once', () => {
      const queue = createTaskQueue(pause);
      const endFirst = queue.begin('scan');
      const endSecond = queue.begin('scan');

      endFirst();
      endFirst();
      expect(queue.isBusy('scan')).toBe(true);

      vi.setSystemTime(3000);
      endSecond();
      vi.setSystemTime(4000);

      expect(queue.isBusy('scan')).toBe(false);
      expect(queue.idleFor('scan')).toBe(1000);
    });
  });

  describe('stopping', () => {
    it('tells the running task, drops the waiting ones and answers when the task is over', async () => {
      const queue = createTaskQueue(pause);
      const running = deferred();
      let signal: AbortSignal | undefined;
      queue.enqueue(
        task('a', 1, (given) => {
          signal = given;
          return running.promise;
        })
      );
      queue.enqueue(task('b', 1, record('b')));
      queue.start();
      await settle();

      const stopped = vi.fn();
      queue.stop().then(stopped);
      await settle();
      expect(signal?.aborted).toBe(true);
      expect(stopped).not.toHaveBeenCalled();

      running.finish();
      await settle();

      expect(stopped).toHaveBeenCalled();
      expect(order).toEqual([]);
    });

    it('answers at once for a queue that never started', async () => {
      await expect(createTaskQueue(pause).stop()).resolves.toBeUndefined();
    });
  });
});
