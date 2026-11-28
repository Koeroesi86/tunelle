import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/pages/group-overview/GroupOverview';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/group-overview/GroupOverview', () => ({ default: vi.fn(() => null) }));

describe('the container of GroupOverview', () => {
  it('shows the open group with the kinds of the servers and the playlists', () => {
    const { store } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, overviewGroup: 'playlists' } }));

    expect(propsOf(View)).toMatchObject({ group: 'playlists', sourceKinds: [], playlists: store.getState().playlists });
  });

  it('gives the kind of each server', () => {
    renderContainer(<Container />, (state) => ({
      ...state,
      sources: {
        ...state.sources,
        servers: [{ id: 'server', kind: 'plex' as const, name: 'Den', url: 'https://music.local', username: 'me', protected: true }],
      },
    }));

    expect(propsOf(View).sourceKinds).toEqual(['plex']);
  });

  it('opens what is chosen', () => {
    const { sent } = renderContainer(<Container />);
    const { openLibraryView, openOnlineView, openPlaylist, openOverview } = propsOf(View);

    openLibraryView?.('genres');
    openOnlineView?.('radio');
    openPlaylist?.(3);
    openOverview?.('library');

    expect(sent()).toEqual([
      { type: 'SET_VIEW', payload: { view: 'genres' } },
      { type: 'SET_TAB', payload: { tab: 'local' } },
      { type: 'SET_ONLINE_VIEW', payload: { view: 'radio' } },
      { type: 'SET_TAB', payload: { tab: 'online-sources' } },
      { type: 'OPEN_PLAYLIST', payload: { id: 3 } },
      { type: 'OPEN_GROUP_OVERVIEW', payload: { group: 'library' } },
    ]);
  });
});
