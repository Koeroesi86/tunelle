import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/library-search/LibrarySearch';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/library-search/LibrarySearch', () => ({ default: vi.fn(() => null) }));

describe('the container of LibrarySearch', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, groupFilter: 'bach' } }));
    const { search, setSearch } = propsOf(View);

    setSearch('monk');

    expect(search).toEqual('bach');
    expect(sent()).toEqual([{ type: 'SET_GROUP_FILTER', payload: { filter: 'monk' } }]);
  });
});
