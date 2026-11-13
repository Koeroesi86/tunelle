import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import ArtistPhotoMenu from './ArtistPhotoMenu';

interface OwnProps {
  /** The name as the library compares it, which the photo is kept by */
  photoKey: string;
}

const mapState = (state: RootState) => ({ failure: state.uiState.artistPhotoFailure });

const mapDispatch = (dispatch: Dispatch<AppAction>, { photoKey }: OwnProps) => ({
  change: (change: 'pick' | 'remove' | 'reset') => dispatch({ type: 'CHANGE_ARTIST_PHOTO', payload: { key: photoKey, change } }),
});

export default connect(mapState, mapDispatch)(ArtistPhotoMenu);
