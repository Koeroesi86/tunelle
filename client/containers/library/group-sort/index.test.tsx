import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/group-sort/GroupSort';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/group-sort/GroupSort', () => ({ default: vi.fn(() => null) }));

describe('the container of GroupSort', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({
      ...state,
      uiState: { ...state.uiState, groupSort: { field: 'name' as const, direction: 'desc' as const } },
    }));
    const { sort, setSort } = propsOf(View);

    setSort(undefined);

    expect(sort).toEqual({ field: 'name' as const, direction: 'desc' as const });
    expect(sent()).toEqual([{ type: 'SET_GROUP_SORT', payload: { sort: undefined } }]);
  });
});
