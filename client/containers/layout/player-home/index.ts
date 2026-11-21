import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { getBackend } from '../../../backend/backend';
import PlayerHome from '../../../components/layout/player-home/PlayerHome';

const mapState = (state: RootState) => ({
  loaded: state.library.loaded,
  maximized: state.uiState.maximized,
  blurred: !getBackend().capabilities.software && (getBackend().capabilities.blur || state.uiState.desktopBlur),
  folders: state.folders,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  addFiles: (fileList: FileList) => dispatch({ type: 'FILES_ADDED', payload: { fileList } }),
  onUnload: () => dispatch({ type: 'SAVE_SETTINGS', payload: {} }),
});

export default connect(mapState, mapDispatch)(PlayerHome);
