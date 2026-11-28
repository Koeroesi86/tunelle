import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/watch-folders/WatchFolders';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/watch-folders/WatchFolders', () => ({ default: vi.fn(() => null) }));

describe('the container of WatchFolders', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, watchFolders: true } }));
    const { enabled, setEnabled } = propsOf(View);

    setEnabled(false);

    expect(enabled).toEqual(true);
    expect(sent()).toEqual([{ type: 'SET_WATCH_FOLDERS', payload: { enabled: false } }]);
  });
});
