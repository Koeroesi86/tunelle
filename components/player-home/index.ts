import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import { electronAPI } from '../../client/services/electron-api';
import PlayerHome from './PlayerHome';

const mapState = (state: RootState) => ({
  loaded: state.library.loaded,
  maximized: state.uiState.maximized,
  blurred: electronAPI.blurred || state.uiState.desktopBlur,
  folders: state.folders,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  addFiles: (fileList: FileList) => dispatch({ type: 'FILES_ADDED', payload: { fileList } }),
  onUnload: () => dispatch({ type: 'SAVE_SETTINGS', payload: {} }),
});

export default connect(mapState, mapDispatch)(PlayerHome);
