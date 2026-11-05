import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import AlbumDetails from './AlbumDetails';

const mapState = (state: RootState) => ({
  album: state.uiState.selectedAlbum,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  close: () => dispatch({ type: 'SELECT_ALBUM', payload: { album: null } }),
});

export default connect(mapState, mapDispatch)(AlbumDetails);
