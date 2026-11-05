interface MapAsyncOptions {
  /** How many tasks run at the same time; 1 runs them one after the other */
  concurrency?: number;
}

/** Maps the items with an async task, a round of `concurrency` items after the other, the results in the order of the items; after a failure no round is started, and it is the error that is thrown */
export const mapAsync = async <T, R>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<R>,
  { concurrency = 1 }: MapAsyncOptions = {}
): Promise<R[]> => {
  const size = Math.max(1, concurrency);
  const results: R[] = [];

  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map((item, offset) => task(item, start + offset)))));
  }

  return results;
};
