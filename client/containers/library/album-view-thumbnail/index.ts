import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import AlbumViewThumbnail from '../../../components/library/album-view-thumbnail/AlbumViewThumbnail';

const mapState = (state: RootState) => ({
  offlineFolders: state.offlineFolders,
});

export default connect(mapState)(AlbumViewThumbnail);
