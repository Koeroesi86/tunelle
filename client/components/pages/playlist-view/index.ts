import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import PlaylistView from './PlaylistView';

const mapState = ({ playlists, uiState }: RootState) => ({
  playlist: playlists.find(({ id }) => id === uiState.playlistId),
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  rename: (id: number, name: string) => dispatch({ type: 'RENAME_PLAYLIST', payload: { id, name } }),
  remove: (id: number) => dispatch({ type: 'DELETE_PLAYLIST', payload: { id } }),
  removeEntry: (id: number, entryId: number) => dispatch({ type: 'REMOVE_FROM_PLAYLIST', payload: { id, entryId } }),
  moveEntry: (id: number, entryId: number, toIndex: number) => dispatch({ type: 'MOVE_PLAYLIST_ENTRY', payload: { id, entryId, toIndex } }),
});

export default connect(mapState, mapDispatch)(PlaylistView);
