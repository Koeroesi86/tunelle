import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import type { LibraryView } from '../../../domain/navigation';
import type { LocalCollectionControls } from '../../../components/pages/local-collection/LocalCollection';
import LocalCollection from '../../../components/pages/local-collection/LocalCollection';
import AlbumSort from '../../library/album-sort';
import AlbumView from '../../library/album-view';
import FolderFilter from '../../library/folder-filter';
import GroupFilter from '../../library/group-filter';
import GroupSort from '../../library/group-sort';
import GroupView from '../../library/group-view';
import LibrarySearch from '../../library/library-search';
import RescanButton from '../../library/rescan-button';
import TrackView from '../../library/track-view';
import FolderManagement from '../../settings/folder-management';

/** The lists and the controls are the same elements for every render, so the page does not render them again for nothing */
const panels = {
  albums: <AlbumView />,
  artists: <GroupView kind="artist" />,
  albumArtists: <GroupView kind="albumArtist" />,
  genres: <GroupView kind="genre" />,
  tracks: <TrackView />,
  folders: <FolderManagement />,
};

const controls: LocalCollectionControls = {
  search: <LibrarySearch />,
  groupFilter: (label) => <GroupFilter label={label} />,
  folderFilter: <FolderFilter />,
  albumSort: <AlbumSort />,
  groupSort: <GroupSort />,
  rescan: <RescanButton />,
};

const mapState = (state: RootState) => ({
  view: state.uiState.view,
  groupOpen: state.uiState.openGroup !== undefined,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setView: (view: LibraryView) => dispatch({ type: 'SET_VIEW', payload: { view } }),
  panels,
  controls,
});

export default connect(mapState, mapDispatch)(LocalCollection);
