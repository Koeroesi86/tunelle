/** Map the items with a limit on how many are in flight, as the thread pool of Node is shared with the database and with the files the player reads */
export const mapInChunks = <T, R>(items: T[], size: number, map: (item: T) => Promise<R>): Promise<R[]> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)).reduce<Promise<R[]>>(
    (done, chunk) => done.then(async (results) => [...results, ...(await Promise.all(chunk.map(map)))]),
    Promise.resolve([])
  );
