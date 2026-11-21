import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { TrackSort } from '@shared/types/library-query';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { listKey } from '../../../redux/sources/lists';
import TrackView from '../../../components/library/track-view/TrackView';
import { trackActions } from '../item-actions';
import { keepSourcePages, loadSourcePage, pagesAhead, unanswered } from '../source-list';

interface OwnProps {
  /** The first page of the list, which says the server and what is listed of it */
  request: SourceBrowse;
  /** The order of a library list is set in its header; the tracks of an album and of a search have their own */
  setTitleOrder?: (title: boolean) => void;
}

const mapState = (state: RootState, { request }: OwnProps) => ({
  tracks: state.sources.lists.tracks[listKey(request)] ?? unanswered,
  currentSong: state.uiState.currentSong,
  selectedTracks: state.uiState.selectedTracks,
  search: request.what === 'search' ? request.query : undefined,
});

const mapDispatch = (dispatch: Dispatch<AppAction>, { request }: OwnProps) => ({
  loadPage: loadSourcePage(dispatch, request),
  keepPages: keepSourcePages(dispatch, request),
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  toggleTrack: (track: Track) => dispatch({ type: 'TOGGLE_TRACK_SELECTION', payload: { track } }),
  selectTracks: (tracks: Track[]) => dispatch({ type: 'SELECT_TRACKS', payload: { tracks } }),
  clearSelection: () => dispatch({ type: 'CLEAR_TRACK_SELECTION', payload: {} }),
});

export default connect(mapState, mapDispatch, (state, dispatch, { request, setTitleOrder }: OwnProps) => ({
  ...state,
  ...dispatch,
  sort: request.what === 'library' && request.sort === 'title' ? { field: 'title' as const, direction: 'asc' as const } : undefined,
  setSort: (sort: TrackSort | undefined) => setTitleOrder?.(sort?.field === 'title'),
  // the pages that are not fetched yet are not in the cache, the selection is what is listed
  pagesAhead,
  renderActions: trackActions,
  fetchAll: () => Promise.resolve(Object.values(state.tracks.pages).flat()),
}))(TrackView);
