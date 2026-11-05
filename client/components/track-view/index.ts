import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { TrackSort } from '@shared/types/library-query';
import type { RootState } from '../../redux/reducers';
import type { AppAction } from '../../redux/types';
import { selectSearch } from '../../domain/library-query';
import TrackView from './TrackView';

const mapState = (state: RootState) => ({
  tracks: state.library.tracks,
  currentSong: state.uiState.currentSong,
  offlineFolders: state.offlineFolders,
  sort: state.uiState.trackSort,
  selected: state.uiState.libraryFolders,
  folders: state.folders,
  search: selectSearch(state),
  selectedTracks: state.uiState.selectedTracks,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  loadPage: (page: number) => dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'tracks', page } }),
  setSort: (sort: TrackSort | undefined) => dispatch({ type: 'SET_TRACK_SORT', payload: { sort } }),
  toggleTrack: (track: Track) => dispatch({ type: 'TOGGLE_TRACK_SELECTION', payload: { track } }),
  selectTracks: (tracks: Track[]) => dispatch({ type: 'SELECT_TRACKS', payload: { tracks } }),
  clearSelection: () => dispatch({ type: 'CLEAR_TRACK_SELECTION', payload: {} }),
});

export default connect(mapState, mapDispatch)(TrackView);
