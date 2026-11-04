import { afterEach, describe, expect, it, vi } from 'vitest';
import { shuffled } from './shuffled';

describe('shuffled', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps every item once and leaves the list as it was', () => {
    const items = [1, 2, 3, 4, 5, 6];

    expect(shuffled(items).sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('puts the items in the order the random numbers give', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shuffled(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);

    random.mockReturnValue(0.99);
    expect(shuffled(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('copes with no items and with one', () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled(['a'])).toEqual(['a']);
  });
});
