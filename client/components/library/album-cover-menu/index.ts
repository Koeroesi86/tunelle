import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import AlbumCoverMenu from './AlbumCoverMenu';

interface OwnProps {
  /** The folder and the title of the album, which its cover is kept by */
  path: string;
  title: string;
  /** Starts the text of a search with the name of the artist */
  artist: string;
}

const mapState = (state: RootState, { artist, title }: OwnProps) => ({
  failure: state.uiState.albumCoverFailure,
  candidates: state.uiState.albumCoverCandidates,
  initialQuery: `${artist} ${title}`.trim(),
});

const mapDispatch = (dispatch: Dispatch<AppAction>, { path, title }: OwnProps) => ({
  change: (change: 'pick' | 'remove' | 'reset') => dispatch({ type: 'CHANGE_ALBUM_COVER', payload: { path, title, change } }),
  search: (query: string) => dispatch({ type: 'SEARCH_ALBUM_COVERS', payload: { query } }),
  download: (picture: string) => dispatch({ type: 'CHANGE_ALBUM_COVER', payload: { path, title, change: 'download', picture } }),
});

export default connect(mapState, mapDispatch)(AlbumCoverMenu);
