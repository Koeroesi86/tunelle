import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/notify-library-changes/NotifyLibraryChanges';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/notify-library-changes/NotifyLibraryChanges', () => ({ default: vi.fn(() => null) }));

describe('the container of NotifyLibraryChanges', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, notifyLibraryChanges: true } }));
    const { enabled, setEnabled } = propsOf(View);

    setEnabled(false);

    expect(enabled).toEqual(true);
    expect(sent()).toEqual([{ type: 'SET_NOTIFY_LIBRARY_CHANGES', payload: { enabled: false } }]);
  });
});
