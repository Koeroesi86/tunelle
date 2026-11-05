import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LibrarySearch from './LibrarySearch';

const box = () => screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search the library' });

describe('LibrarySearch', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the search that is set, without searching again', () => {
    const setSearch = vi.fn();
    render(<LibrarySearch search="halo" setSearch={setSearch} />);
    act(() => void vi.advanceTimersByTime(1000));

    expect(box().value).toBe('halo');
    expect(setSearch).not.toHaveBeenCalled();
  });

  it('searches the text once the typing stops', () => {
    const setSearch = vi.fn();
    render(<LibrarySearch search="" setSearch={setSearch} />);

    fireEvent.change(box(), { target: { value: 'be' } });
    act(() => void vi.advanceTimersByTime(200));
    fireEvent.change(box(), { target: { value: 'bey' } });
    act(() => void vi.advanceTimersByTime(200));
    expect(setSearch).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(400));
    expect(setSearch).toHaveBeenCalledTimes(1);
    expect(setSearch).toHaveBeenCalledWith('bey');
  });

  it('does not take what setSearch returns for a cleanup, as the dispatch of the store returns the action', () => {
    const setSearch = vi.fn(() => ({ type: 'SET_LIBRARY_SEARCH' }));
    const { unmount } = render(<LibrarySearch search="" setSearch={setSearch} />);

    fireEvent.change(box(), { target: { value: 'bey' } });
    act(() => void vi.advanceTimersByTime(400));

    expect(setSearch).toHaveBeenCalledWith('bey');
    expect(() => unmount()).not.toThrow();
  });

  it('is called by the label it is given', () => {
    render(<LibrarySearch search="" setSearch={vi.fn()} label="Filter by name" />);

    expect(screen.getByRole('searchbox', { name: 'Filter by name' }).getAttribute('placeholder')).toBe('Filter by name');
  });
});
