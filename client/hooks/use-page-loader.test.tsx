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
});
