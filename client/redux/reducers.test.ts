import { describe, expect, it } from 'vitest';
import reducers from './reducers';

describe('root reducer', () => {
  it('composes favourites, folders, history, library, offlineFolders, radio, sources, uiState and update', () => {
    expect(Object.keys(reducers(undefined, { type: '@@INIT' })).sort()).toEqual([
      'favourites',
      'folders',
      'history',
      'library',
      'offlineFolders',
      'playlists',
      'radio',
      'sources',
      'uiState',
      'update',
    ]);
  });
});
