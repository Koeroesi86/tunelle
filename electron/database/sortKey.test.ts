import { describe, expect, it } from 'vitest';
import { toSortKey, toSortKeys } from './sortKey';

describe('toSortKey', () => {
  it.each([
    ['Ékes', 'ekes'],
    ['Őrült Űr', 'orult ur'],
    ['  Zebra ', 'zebra'],
    ['ÅNGSTRÖM', 'angstrom'],
  ])('sorts %s as %s, without case and accents', (value, key) => {
    expect(toSortKey(value)).toBe(key);
  });

  it('is empty for a missing value', () => {
    expect(toSortKey(null)).toBe('');
    expect(toSortKey(undefined)).toBe('');
  });

  it('gives the keys of the title, the artist, the album, the album artist and the genre in the order of their columns', () => {
    expect(toSortKeys({ title: 'Á', artist: 'B', album: 'C', albumArtist: 'É', genre: ' Pop ' })).toEqual(['a', 'b', 'c', 'e', 'pop']);
    expect(toSortKeys({ title: '', artist: '', album: '', genre: '' })).toEqual(['', '', '', '', '']);
  });
});
