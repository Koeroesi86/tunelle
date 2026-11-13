import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import AlbumCoverMenu from './AlbumCoverMenu';

interface OwnProps {
  /** The folder and the title of the album, which its cover is kept by */
  path: string;
  title: string;
}

const mapState = (state: RootState) => ({ failure: state.uiState.albumCoverFailure });

const mapDispatch = (dispatch: Dispatch<AppAction>, { path, title }: OwnProps) => ({
  change: (change: 'pick' | 'remove' | 'reset') => dispatch({ type: 'CHANGE_ALBUM_COVER', payload: { path, title, change } }),
});

export default connect(mapState, mapDispatch)(AlbumCoverMenu);
