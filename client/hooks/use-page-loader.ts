import { useEffect } from 'react';
import { pagesToLoad } from '../redux/library/pages';
import { pageSize } from '../constants/library';
import type { PageCache } from '../redux/library/pages';

/** Request the pages of the cache that the items from start to end (exclusive), and the pages ahead of them, need and that are missing or stale */
export const usePageLoader = <T>(cache: PageCache<T>, start: number, end: number, loadPage: (page: number) => void, pagesAhead = 0) => {
  useEffect(() => {
    pagesToLoad(cache, start, end + pagesAhead * pageSize).forEach((page) => loadPage(page));
  }, [cache, start, end, loadPage, pagesAhead]);
};
