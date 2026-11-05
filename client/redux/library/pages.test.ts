import { describe, expect, it } from 'vitest';
import { createPageCache, getCachedItem, markStale, maxCachedPages, pagesToLoad, storePage } from './pages';
import { pageSize } from '../../constants/library';

const page = (start: number) => Array.from({ length: pageSize }, (_, offset) => start + offset);

describe('page cache', () => {
  it('looks up an item in its page', () => {
    const cache = storePage(createPageCache<number>(), 2, page(200), 1000);

    expect(getCachedItem(cache, 205)).toBe(205);
    expect(getCachedItem(cache, 5)).toBeUndefined();
  });

  it('requests the first page while the length is unknown, once', () => {
    expect(pagesToLoad(createPageCache<number>(), 0, 0)).toEqual([0]);
    expect(pagesToLoad({ total: undefined, pages: { 0: page(0) }, stale: [] }, 0, 0)).toEqual([]);
  });

  it('requests the missing pages of a range only', () => {
    const cache = storePage(createPageCache<number>(), 0, page(0), 1000);

    expect(pagesToLoad(cache, 90, 320)).toEqual([1, 2, 3]);
    expect(pagesToLoad(cache, 0, 100)).toEqual([]);
  });

  it('does not request pages behind the end of the list', () => {
    const cache = storePage(createPageCache<number>(), 0, page(0), 150);

    expect(pagesToLoad(cache, 0, 600)).toEqual([1]);
    expect(pagesToLoad(storePage(createPageCache<number>(), 0, [], 0), 0, 0)).toEqual([]);
  });

  it('requests the first page of an empty list again when it is stale', () => {
    const empty = storePage(createPageCache<number>(), 0, [], 0);

    expect(pagesToLoad(markStale(empty), 0, 0)).toEqual([0]);
  });

  it('requests stale pages of the range again and leaves the others stale', () => {
    const cache = markStale(storePage(storePage(createPageCache<number>(), 0, page(0), 1000), 5, page(500), 1000));

    expect(pagesToLoad(cache, 0, 100)).toEqual([0]);
    expect(storePage(cache, 0, page(0), 1000).stale).toEqual([5]);
  });

  it('keeps the pages nearest to the stored page when there are too many', () => {
    const total = pageSize * 100;
    const cache = Array.from({ length: maxCachedPages + 10 }, (_, index) => index).reduce(
      (current, index) => storePage(current, index, page(index * pageSize), total),
      createPageCache<number>()
    );

    const pages = Object.keys(cache.pages).map(Number);
    expect(pages).toHaveLength(maxCachedPages);
    expect(pages).toContain(maxCachedPages + 9);
    expect(pages).not.toContain(0);
  });

  it('drops the pages behind the new end of the list', () => {
    const cache = storePage(storePage(createPageCache<number>(), 3, page(300), 1000), 0, page(0), 50);

    expect(Object.keys(cache.pages)).toEqual(['0']);
  });
});
