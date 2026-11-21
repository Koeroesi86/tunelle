import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageLoader } from './use-page-loader';
import { createPageCache, markStale, storePage } from '../redux/library/pages';
import { pageSize } from '../constants/library';

describe('usePageLoader', () => {
  const items = Array.from({ length: pageSize }, (_, index) => index);

  it('requests the first page of an empty cache', () => {
    const loadPage = vi.fn();
    renderHook(() => usePageLoader(createPageCache<number>(), 0, 0, loadPage));

    expect(loadPage.mock.calls).toEqual([[0]]);
  });

  it('requests the pages the range needs when they are missing, and again when they go stale', () => {
    const loadPage = vi.fn();
    const cache = storePage(createPageCache<number>(), 0, items, 300);
    const { rerender } = renderHook(({ current }) => usePageLoader(current, 0, 250, loadPage), { initialProps: { current: cache } });
    expect(loadPage.mock.calls).toEqual([[1], [2]]);

    loadPage.mockClear();
    rerender({ current: markStale(storePage(storePage(cache, 1, items, 300), 2, items, 300)) });
    expect(loadPage.mock.calls).toEqual([[0], [1], [2]]);
  });

  it('requests the pages ahead of the range as well, up to the end of the list', () => {
    const loadPage = vi.fn();
    const cache = storePage(createPageCache<number>(), 0, items, 450);
    renderHook(() => usePageLoader(cache, 0, 50, loadPage, 2));

    expect(loadPage.mock.calls).toEqual([[1], [2]]);

    loadPage.mockClear();
    renderHook(() => usePageLoader(cache, 0, 50, loadPage, 10));
    expect(loadPage.mock.calls).toEqual([[1], [2], [3], [4]]);
  });

  it('tells which pages are wanted, the ones of the range and those ahead of it, before it loads', () => {
    const calls: string[] = [];
    const keepPages = vi.fn((pages: number[]) => calls.push(`keep ${pages.join(',')}`));
    const loadPage = vi.fn((page: number) => calls.push(`load ${page}`));
    const cache = storePage(createPageCache<number>(), 0, items, 450);

    renderHook(() => usePageLoader(cache, 100, 150, loadPage, 1, keepPages));

    expect(calls).toEqual(['keep 1,2', 'load 1', 'load 2']);
  });
});
