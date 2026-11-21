import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { selectSearch } from '../../../domain/library-query';
import { localAlbumActions } from '../local-album';
import AlbumView from '../../../components/library/album-view/AlbumView';

/** The albums of the open artist, album artist or genre: the list of the albums, fetched for the group */
const mapState = (state: RootState) => ({
  albums: state.library.groupAlbums,
  sort: state.uiState.albumSort,
  coverSize: state.uiState.coverSize,
  selected: state.uiState.libraryFolders,
  folders: state.folders,
  search: selectSearch(state),
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  ...localAlbumActions(dispatch),
  setCoverSize: (size: number) => dispatch({ type: 'SET_COVER_SIZE', payload: { size } }),
  loadPage: (page: number) => dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'groupAlbums', page } }),
});

export default connect(mapState, mapDispatch)(AlbumView);
