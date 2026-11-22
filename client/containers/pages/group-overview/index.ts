import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import type { LibraryView, NavigationGroup, OnlineView } from '../../../domain/navigation';
import GroupOverview from '../../../components/pages/group-overview/GroupOverview';

const mapState = (state: RootState) => ({
  group: state.uiState.overviewGroup,
  sourceKinds: state.sources.servers.map(({ kind }) => kind),
  playlists: state.playlists,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  openLibraryView: (view: LibraryView) => {
    dispatch({ type: 'SET_VIEW', payload: { view } });
    dispatch({ type: 'SET_TAB', payload: { tab: 'local' } });
  },
  openOnlineView: (view: OnlineView) => {
    dispatch({ type: 'SET_ONLINE_VIEW', payload: { view } });
    dispatch({ type: 'SET_TAB', payload: { tab: 'online-sources' } });
  },
  openPlaylist: (id: number) => dispatch({ type: 'OPEN_PLAYLIST', payload: { id } }),
  openOverview: (group: NavigationGroup) => dispatch({ type: 'OPEN_GROUP_OVERVIEW', payload: { group } }),
});

export default connect(mapState, mapDispatch)(GroupOverview);
