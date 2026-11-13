import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import ArtistPhoto from './ArtistPhoto';

const mapState = (state: RootState) => ({ revision: state.uiState.artistPhotoRevision });

export default connect(mapState)(ArtistPhoto);
