import { backgroundQueue } from './background-queue';

const waiting = new Map<string, Promise<void>>();

/** Runs the work as a task of the background queue and answers when it is over; a caller of a key that waits gets the answer of the task that waits. See docs/app/task-queue.md */
export const queueTask = (kind: string, key: string, priority: number, work: () => Promise<void>): Promise<void> => {
  const shared = waiting.get(key);
  if (shared) return shared;

  const done = new Promise<void>((resolve, reject) => {
    backgroundQueue.enqueue({
      kind,
      key,
      priority,
      run: () => {
        waiting.delete(key);
        return work().then(resolve, reject);
      },
    });
  });
  waiting.set(key, done);
  return done;
};

/** The priority of the scans of the library, which come before any other work */
export const scanPriority = 10;
