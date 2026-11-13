import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import ArtistPhotoMenu from './ArtistPhotoMenu';

interface OwnProps {
  /** The name as the library compares it, which the photo is kept by, and the name as it is written */
  photoKey: string;
  name: string;
}

const mapState = (state: RootState) => ({
  failure: state.uiState.artistPhotoFailure,
  candidates: state.uiState.artistPhotoCandidates,
  searchAllowed: state.uiState.artistPhotos,
});

const mapDispatch = (dispatch: Dispatch<AppAction>, { photoKey }: OwnProps) => ({
  change: (change: 'pick' | 'remove' | 'reset') => dispatch({ type: 'CHANGE_ARTIST_PHOTO', payload: { key: photoKey, change } }),
  search: (query: string) => dispatch({ type: 'SEARCH_ARTIST_PHOTOS', payload: { query } }),
  download: (picture: string) => dispatch({ type: 'CHANGE_ARTIST_PHOTO', payload: { key: photoKey, change: 'download', picture } }),
});

export default connect(mapState, mapDispatch)(ArtistPhotoMenu);
