interface MapAsyncOptions {
  /** How many tasks run at the same time; 1 runs them one after the other */
  concurrency?: number;
}

/** Maps the items with an async task, the results in the order of the items; after the first failure no task is started, and it is the error that is thrown */
export const mapAsync = async <T, R>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<R>,
  { concurrency = 1 }: MapAsyncOptions = {}
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  const stop = (error: unknown): never => {
    failed = true;
    throw error;
  };

  const work = async () => {
    for (let index = next++; index < items.length && !failed; index = next++) {
      results[index] = await task(items[index], index).catch(stop);
    }
  };

  const workers: Promise<void>[] = [];
  for (let worker = 0; worker < Math.max(1, Math.min(concurrency, items.length)); worker++) workers.push(work());

  await Promise.all(workers);

  return results;
};
