import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { GroupKind } from '@shared/types/library-query';
import type { RootState } from '../../redux/reducers';
import type { AppAction, OpenGroup } from '../../redux/types';
import GroupView from './GroupView';

interface OwnProps {
  kind: GroupKind;
}

const mapState = (state: RootState, { kind }: OwnProps) => ({
  groups: state.library.groups[kind],
  sort: state.uiState.groupSort,
  filter: state.uiState.groupFilter,
  coverSize: state.uiState.coverSize,
  selected: state.uiState.libraryFolders,
  folders: state.folders,
  open: state.uiState.openGroup?.kind === kind ? state.uiState.openGroup : undefined,
});

const mapDispatch = (dispatch: Dispatch<AppAction>, { kind }: OwnProps) => ({
  loadPage: (page: number) => dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind, page } }),
  setCoverSize: (size: number) => dispatch({ type: 'SET_COVER_SIZE', payload: { size } }),
  openGroup: (group: OpenGroup) => dispatch({ type: 'OPEN_GROUP', payload: { group } }),
  closeGroup: () => dispatch({ type: 'CLOSE_GROUP', payload: {} }),
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
});

export default connect(mapState, mapDispatch)(GroupView);
