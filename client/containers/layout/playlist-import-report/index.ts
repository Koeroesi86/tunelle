import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import PlaylistImportReport from '../../../components/layout/playlist-import-report/PlaylistImportReport';

const mapState = (state: RootState) => ({ reports: state.uiState.playlistImport });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  close: () => dispatch({ type: 'DISMISS_PLAYLIST_IMPORT' }),
});

export default connect(mapState, mapDispatch)(PlaylistImportReport);
