import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction, LibraryView, NavigationGroup, Tab } from '../../../redux/types';
import Navigation from './Navigation';

const mapState = (state: RootState) => ({
  tab: state.uiState.tab,
  view: state.uiState.view,
  libraryOpen: state.uiState.libraryOpen,
  playlistsOpen: state.uiState.playlistsOpen,
  playlists: state.playlists,
  playlistId: state.uiState.playlistId,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setTab: (tab: Tab) => dispatch({ type: 'SET_TAB', payload: { tab } }),
  // the sidebar picks the view of the library, and the library to show it in
  openLibraryView: (view: LibraryView) => {
    dispatch({ type: 'SET_VIEW', payload: { view } });
    dispatch({ type: 'SET_TAB', payload: { tab: 'local' } });
  },
  setGroupOpen: (group: NavigationGroup, open: boolean) => dispatch({ type: 'SET_NAVIGATION_GROUP', payload: { group, open } }),
  openPlaylist: (id: number) => dispatch({ type: 'OPEN_PLAYLIST', payload: { id } }),
  createPlaylist: (name: string) => dispatch({ type: 'CREATE_PLAYLIST', payload: { name } }),
  movePlaylist: (id: number, toIndex: number) => dispatch({ type: 'MOVE_PLAYLIST', payload: { id, toIndex } }),
});

export default connect(mapState, mapDispatch)(Navigation);
