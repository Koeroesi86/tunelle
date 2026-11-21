import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import { fetchGroupCover } from '../../../services/library-api';
import ArtistPhoto from '../../../components/library/artist-photo/ArtistPhoto';

const mapState = (state: RootState) => ({ revision: state.uiState.artistPhotoRevision, fetchCover: fetchGroupCover });

export default connect(mapState)(ArtistPhoto);
