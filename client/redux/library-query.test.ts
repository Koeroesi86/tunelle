import { describe, expect, it } from 'vitest';
import type { Folder } from '@shared/types/library';
import reducers from './reducers';
import { selectAlbumQuery, selectGroupAlbumQuery, selectGroupQuery, selectTrackQuery } from './library-query';

const folder = (path: string): Folder => ({ path, lastModified: 1 });

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
