import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import ArtistPhoto from '../../../components/library/artist-photo/ArtistPhoto';

const mapState = (state: RootState) => ({ revision: state.uiState.artistPhotoRevision });

export default connect(mapState)(ArtistPhoto);
