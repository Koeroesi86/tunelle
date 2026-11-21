import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction, OpenGroup } from '../../../redux/types';
import { listKey } from '../../../redux/sources/lists';
import GroupView from '../../../components/library/group-view/GroupView';
import { loadSourcePage, unanswered } from '../source-list';

interface OwnProps {
  /** The first page of the list, which says the server and what is listed of it */
  request: SourceBrowse;
  /** An artist is opened where the list is, by its id and name */
  open: (artist: { id: string; name: string }) => void;
}

const mapState = (state: RootState, { request }: OwnProps) => ({
  groups: state.sources.lists.artists[listKey(request)] ?? unanswered,
  coverSize: state.uiState.coverSize,
});

const mapDispatch = (dispatch: Dispatch<AppAction>, { request }: OwnProps) => ({
  loadPage: loadSourcePage(dispatch, request),
  setCoverSize: (size: number) => dispatch({ type: 'SET_COVER_SIZE', payload: { size } }),
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
});

export default connect(mapState, mapDispatch, (state, dispatch, { open }: OwnProps) => ({
  ...state,
  ...dispatch,
  kind: 'artist' as const,
  sort: undefined,
  filter: '',
  open: undefined,
  openGroup: ({ key, name }: OpenGroup) => open({ id: key, name }),
  closeGroup: () => undefined,
}))(GroupView);
