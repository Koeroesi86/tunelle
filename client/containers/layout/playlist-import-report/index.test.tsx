import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/layout/playlist-import-report/PlaylistImportReport';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/playlist-import-report/PlaylistImportReport', () => ({ default: vi.fn(() => null) }));

describe('the container of PlaylistImportReport', () => {
  it('shows the reports of an import, and dismisses them', () => {
    const { store, sent } = renderContainer(<Container />);
    const { reports, close } = propsOf(View);

    close?.();

    expect(reports).toBe(store.getState().uiState.playlistImport);
    expect(sent()).toEqual([{ type: 'DISMISS_PLAYLIST_IMPORT' }]);
  });
});
