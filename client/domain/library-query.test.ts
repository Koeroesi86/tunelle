import { describe, expect, it } from 'vitest';
import type { Folder } from '@shared/types/library';
import {
  cycleSort,
  knownFolders,
  parseAlbumSort,
  parseFolders,
  parseTrackSort,
  restoreAlbumSort,
  restoreTrackSort,
  trackSortFields,
} from '@shared/types/library-query';
import type { TrackSort } from '@shared/types/library-query';
import reducers from '../redux/reducers';
import { selectAlbumQuery, selectedFolders, selectGroupAlbumQuery, selectGroupQuery, selectTrackQuery } from './library-query';

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

  it('restores a saved sort and gives no sort for anything else', () => {
    expect(restoreTrackSort({ field: 'artist', direction: 'asc' })).toEqual({ field: 'artist', direction: 'asc' });
    expect(restoreAlbumSort({ field: 'year', direction: 'desc', extra: 1 })).toEqual({ field: 'year', direction: 'desc' });
    expect([null, 'title', 5, {}, { field: 'x', direction: 'asc' }, { field: 'title' }].map(restoreTrackSort)).toEqual(Array(6).fill(undefined));
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

describe('the query of a list', () => {
  const state = () => {
    const initial = reducers(undefined, { type: '@@INIT' });
    return {
      ...initial,
      folders: [folder('/a'), folder('/b')],
      uiState: { ...initial.uiState, trackSort: { field: 'year' as const, direction: 'asc' as const }, libraryFolders: ['/b', '/gone'] },
    };
  };

  it('has the sort of the list and the selected folders the library still has', () => {
    expect(selectTrackQuery(state())).toEqual({ sort: { field: 'year', direction: 'asc' }, folders: ['/b'] });
    expect(selectAlbumQuery(state())).toEqual({ sort: undefined, folders: ['/b'] });
  });

  it('has the search without the space around it, and none for an empty one', () => {
    const searching = (librarySearch: string) => ({ ...state(), uiState: { ...state().uiState, librarySearch } });

    expect(selectTrackQuery(searching('  halo '))).toMatchObject({ search: 'halo' });
    expect(selectAlbumQuery(searching('  halo '))).toMatchObject({ search: 'halo' });
    expect(selectTrackQuery(searching('   ')).search).toBeUndefined();
    expect(selectTrackQuery(state()).search).toBeUndefined();
  });

  it('has the sort, the folders and the filter of the artists, the album artists and the genres', () => {
    const { uiState, ...rest } = state();
    const query = { ...rest, uiState: { ...uiState, groupSort: { field: 'trackCount' as const, direction: 'desc' as const }, groupFilter: 'bj' } };

    expect(selectGroupQuery(query)).toEqual({ sort: { field: 'trackCount', direction: 'desc' }, folders: ['/b'], filter: 'bj' });
  });

  it('has the albums of the open group, with the sort and the folders of the albums', () => {
    const { uiState, ...rest } = state();
    const open = {
      ...rest,
      uiState: { ...uiState, albumSort: { field: 'year' as const, direction: 'asc' as const }, openGroup: { kind: 'genre' as const, key: 'pop', name: 'Pop' } },
    };

    expect(selectGroupAlbumQuery(open)).toEqual({ sort: { field: 'year', direction: 'asc' }, folders: ['/b'], group: { kind: 'genre', key: 'pop' } });
    expect(selectGroupAlbumQuery(state()).group).toBeUndefined();
  });
});
