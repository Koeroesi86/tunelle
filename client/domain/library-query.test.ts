import { describe, expect, it } from 'vitest';
import type { Folder } from '@shared/types/library';
import { cycleSort, knownFolders, parseAlbumSort, parseFolders, parseTrackSort, trackSortFields } from '@shared/types/library-query';
import type { TrackSort } from '@shared/types/library-query';
import { selectedFolders } from './library-query';

const folder = (path: string): Folder => ({ path, lastModified: 1 });

describe('cycleSort', () => {
  it('goes ascending, descending and back to the default order on a column', () => {
    const ascending = cycleSort<TrackSort['field']>(undefined, 'title');
    const descending = cycleSort(ascending, 'title');

    expect(ascending).toEqual({ field: 'title', direction: 'asc' });
    expect(descending).toEqual({ field: 'title', direction: 'desc' });
    expect(cycleSort(descending, 'title')).toBeUndefined();
  });

  it('starts another column ascending', () => {
    expect(cycleSort<TrackSort['field']>({ field: 'title', direction: 'desc' }, 'year')).toEqual({ field: 'year', direction: 'asc' });
  });
});

describe('parsing a sort', () => {
  it.each(trackSortFields)('knows the track field %s', (field) => {
    expect(parseTrackSort(field, 'desc')).toEqual({ field, direction: 'desc' });
  });

  it('has the fields of the albums apart from the ones of the tracks', () => {
    expect(parseAlbumSort('trackCount', 'asc')).toEqual({ field: 'trackCount', direction: 'asc' });
    expect(parseAlbumSort('track', 'asc')).toBeUndefined();
    expect(parseTrackSort('trackCount', 'asc')).toBeUndefined();
  });

  it.each([
    ['unknown', 'asc'],
    ['title', 'up'],
    ['title', undefined],
    [undefined, 'asc'],
    [['title'], 'asc'],
    ['toString', 'asc'],
  ])('gives no sort for %s %s', (field, direction) => {
    expect(parseTrackSort(field, direction)).toBeUndefined();
  });
});

describe('folders', () => {
  it('parses the strings of a saved selection once each', () => {
    expect(parseFolders(['/a', 3, '/b', '/a', null])).toEqual(['/a', '/b']);
    expect(parseFolders('/a')).toEqual([]);
    expect(parseFolders(undefined)).toEqual([]);
  });

  it('drops a selected folder the library does not have', () => {
    expect(knownFolders(['/a', '/gone'], ['/a', '/b'])).toEqual(['/a']);
    expect(selectedFolders(['/gone'], [folder('/a')])).toEqual([]);
  });
});
