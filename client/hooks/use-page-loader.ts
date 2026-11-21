import { useEffect } from 'react';
import { pagesIn, pagesToLoad } from '../redux/library/pages';
import { pageSize } from '../constants/library';
import type { PageCache } from '../redux/library/pages';

/** Request the pages of the cache that the items from start to end (exclusive), and the pages ahead of them, need and that are missing or stale; keepPages says which pages are wanted, for the requests of the others to be dropped */
export const usePageLoader = <T>(
  cache: PageCache<T>,
  start: number,
  end: number,
  loadPage: (page: number) => void,
  pagesAhead = 0,
  keepPages?: (pages: number[]) => void
) => {
  useEffect(() => {
    const wantedEnd = end + pagesAhead * pageSize;
    keepPages?.(pagesIn(cache, start, wantedEnd));
    pagesToLoad(cache, start, wantedEnd).forEach((page) => loadPage(page));
  }, [cache, start, end, loadPage, pagesAhead, keepPages]);
};
