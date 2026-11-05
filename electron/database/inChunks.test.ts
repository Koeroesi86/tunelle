import { describe, expect, it } from 'vitest';
import { mapInChunks } from './inChunks';

describe('mapInChunks', () => {
  it('keeps the order of the items, and has no more than the size in flight', async () => {
    let inFlight = 0;
    let most = 0;
    const results = await mapInChunks([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return item * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(most).toBe(3);
  });

  it('is empty for nothing', async () => {
    expect(await mapInChunks([], 3, async (item) => item)).toEqual([]);
  });
});
