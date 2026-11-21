import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { albumCoverMenu, albumDetailsActions } from '../item-actions';
import AlbumDetails from '../../../components/library/album-details/AlbumDetails';

const mapState = (state: RootState) => ({
  album: state.uiState.selectedAlbum,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  addToQueue: (tracks: Track[], next: boolean) => dispatch({ type: next ? 'PLAY_NEXT' : 'ADD_TO_QUEUE', payload: { tracks } }),
  renderActions: albumDetailsActions,
  renderCoverMenu: albumCoverMenu,
  close: () => dispatch({ type: 'SELECT_ALBUM', payload: { album: null } }),
});

export default connect(mapState, mapDispatch)(AlbumDetails);
