import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/layout/navigation/Navigation';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/navigation/Navigation', () => ({ default: vi.fn(() => null) }));

describe('the container of Navigation', () => {
  const props = { rail: false, onNavigate: vi.fn(), spectrum: false };

  it('shows where the app is, the open groups and the playlists', () => {
    const { store } = renderContainer(<Container {...props} />);
    const { uiState, playlists } = store.getState();
    const { tab, view, onlineView, libraryOpen, onlineOpen, closedSources, overviewGroup, playlistsOpen, playlistId } = uiState;

    expect(propsOf(View)).toMatchObject({ tab, view, onlineView, libraryOpen, onlineOpen, closedSources, overviewGroup, playlistsOpen, playlistId, playlists });
    expect(propsOf(View).sourceKinds).toEqual([]);
  });

  it('gives the kind of each server', () => {
    renderContainer(<Container {...props} />, (state) => ({
      ...state,
      sources: {
        ...state.sources,
        servers: [{ id: 'server', kind: 'plex' as const, name: 'Den', url: 'https://music.local', username: 'me', protected: true }],
      },
    }));

    expect(propsOf(View).sourceKinds).toEqual(['plex']);
  });

  it('opens a view of the library or of the online sources together with its page', () => {
    const { sent } = renderContainer(<Container {...props} />);
    const { openLibraryView, openOnlineView } = propsOf(View);

    openLibraryView?.('genres');
    openOnlineView?.('radio');

    expect(sent()).toEqual([
      { type: 'SET_VIEW', payload: { view: 'genres' } },
      { type: 'SET_TAB', payload: { tab: 'local' } },
      { type: 'SET_ONLINE_VIEW', payload: { view: 'radio' } },
      { type: 'SET_TAB', payload: { tab: 'online-sources' } },
    ]);
  });

  it('sends what the sidebar asks for', () => {
    const { sent } = renderContainer(<Container {...props} />);
    const { loadSources, setTab, openOverview, setGroupOpen, openPlaylist, importPlaylists, createPlaylist, movePlaylist } = propsOf(View);

    loadSources?.();
    setTab?.('home');
    openOverview?.('library');
    setGroupOpen?.('library', false);
    openPlaylist?.(3);
    importPlaylists?.();
    createPlaylist?.('Mix');
    movePlaylist?.(3, 0);

    expect(sent()).toEqual([
      { type: 'LOAD_SOURCE_SERVERS' },
      { type: 'SET_TAB', payload: { tab: 'home' } },
      { type: 'OPEN_GROUP_OVERVIEW', payload: { group: 'library' } },
      { type: 'SET_NAVIGATION_GROUP', payload: { group: 'library', open: false } },
      { type: 'OPEN_PLAYLIST', payload: { id: 3 } },
      { type: 'IMPORT_PLAYLISTS' },
      { type: 'CREATE_PLAYLIST', payload: { name: 'Mix' } },
      { type: 'MOVE_PLAYLIST', payload: { id: 3, toIndex: 0 } },
    ]);
  });
});
