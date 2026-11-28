import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/album-sort/AlbumSort';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/album-sort/AlbumSort', () => ({ default: vi.fn(() => null) }));

describe('the container of AlbumSort', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({
      ...state,
      uiState: { ...state.uiState, albumSort: { field: 'year' as const, direction: 'desc' as const } },
    }));
    const { sort, setSort } = propsOf(View);

    setSort(undefined);

    expect(sort).toEqual({ field: 'year' as const, direction: 'desc' as const });
    expect(sent()).toEqual([{ type: 'SET_ALBUM_SORT', payload: { sort: undefined } }]);
  });
});
