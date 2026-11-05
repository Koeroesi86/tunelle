import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../redux/reducers';
import type { AppAction } from '../../redux/types';
import { getSourceTracks } from '../../domain/playlists';
import type { PlaylistSource } from '../../domain/playlists';
import AddToPlaylist from './AddToPlaylist';

const mapState = (state: RootState) => ({
  playlists: state.playlists,
});

// an album gives its tracks once they are fetched
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  add: (id: number, source: PlaylistSource) =>
    getSourceTracks(source)
      .then((tracks) => dispatch({ type: 'ADD_TO_PLAYLIST', payload: { id, tracks } }))
      .catch(console.error),
  create: (name: string, source: PlaylistSource) =>
    getSourceTracks(source)
      .then((tracks) => dispatch({ type: 'CREATE_PLAYLIST', payload: { name, tracks } }))
      .catch(console.error),
});

export default connect(mapState, mapDispatch)(AddToPlaylist);
