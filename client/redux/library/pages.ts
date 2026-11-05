import { pageSize } from '../../constants/library';

/** The pages kept in a cache, so scrolling through a very large library does not grow the memory */
export const maxCachedPages = 30;

/** The fetched pages of a list; pages marked stale are shown until they are fetched again */
export interface PageCache<T> {
  /** The length of the whole list, unknown until the first page arrives */
  total: number | undefined;
  pages: Record<number, T[]>;
  stale: number[];
}

export const createPageCache = <T>(): PageCache<T> => ({ total: undefined, pages: {}, stale: [] });

const cachedPages = <T>(cache: PageCache<T>) => Object.keys(cache.pages).map(Number);

/** Keeps the page and, of the others, the ones nearest to it; pages behind the end of the list are dropped */
export const storePage = <T>(cache: PageCache<T>, page: number, items: T[], total: number): PageCache<T> => {
  const lastPage = Math.max(Math.ceil(total / pageSize) - 1, 0);
  const kept = cachedPages(cache)
    .filter((cached) => cached !== page && cached <= lastPage)
    .sort((a, b) => Math.abs(a - page) - Math.abs(b - page))
    .slice(0, maxCachedPages - 1);
  const pages = Object.fromEntries([[page, items], ...kept.map((cached) => [cached, cache.pages[cached]])]);

  return { total, pages, stale: cache.stale.filter((cached) => cached in pages && cached !== page) };
};

/** Every cached page is out of date, they are fetched again when they are needed */
export const markStale = <T>(cache: PageCache<T>): PageCache<T> => ({ ...cache, stale: cachedPages(cache) });

/** The pages to fetch for the items from start to end (exclusive): the missing and the stale ones */
export const pagesToLoad = <T>(cache: PageCache<T>, start: number, end: number): number[] => {
  if (cache.total === undefined) return cache.pages[0] ? [] : [0];

  const first = Math.floor(start / pageSize);
  // an empty list still has its first page, which is stale when the library was empty and then filled
  const last = Math.floor(Math.max(Math.min(end, cache.total) - 1, 0) / pageSize);
  return Array.from({ length: Math.max(last - first + 1, 0) }, (_, offset) => first + offset).filter(
    (page) => !cache.pages[page] || cache.stale.includes(page)
  );
};

export const getCachedItem = <T>(cache: PageCache<T>, index: number): T | undefined => cache.pages[Math.floor(index / pageSize)]?.[index % pageSize];
