import { describe, expect, it, vi } from 'vitest';
import { selectSearch } from '../../../redux/library-query';
import View from '../../../components/library/album-view/AlbumView';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const { openAlbum, albumCornerActions } = vi.hoisted(() => ({ openAlbum: vi.fn(), albumCornerActions: vi.fn() }));

vi.mock('../../../components/library/album-view/AlbumView', () => ({ default: vi.fn(() => null) }));
vi.mock('../local-album', () => ({ localAlbumActions: () => ({ openAlbum }) }));
vi.mock('../item-actions', () => ({ albumCornerActions }));

describe('the container of AlbumView', () => {
  it('gives the view the albums, how they are shown and what narrows them', () => {
    const { store } = renderContainer(<Container />, (state) => ({ ...state, offlineFolders: ['/music'] }));
    const { library, uiState, folders } = store.getState();

    expect(propsOf(View)).toMatchObject({
      albums: library.albums,
      sort: uiState.albumSort,
      coverSize: uiState.coverSize,
      selected: uiState.libraryFolders,
      folders,
    });
    expect(propsOf(View)).toMatchObject({ search: selectSearch(store.getState()), offlineFolders: ['/music'], openAlbum, renderActions: albumCornerActions });
  });

  it('asks for a page of the list and sets the size of the covers', () => {
    const { sent } = renderContainer(<Container />);
    const { loadPage, setCoverSize } = propsOf(View);

    loadPage(2);
    setCoverSize(240);

    expect(sent()).toEqual([
      { type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'albums', page: 2 } },
      { type: 'SET_COVER_SIZE', payload: { size: 240 } },
    ]);
  });
});
