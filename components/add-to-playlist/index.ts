import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import { getSourceTracks } from '../../client/utils/playlists';
import type { PlaylistSource } from '../../client/utils/playlists';
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
