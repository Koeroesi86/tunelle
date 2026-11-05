import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../redux/reducers';
import FolderManagement from './FolderManagement';

const mapState = (state: RootState) => ({
  folders: state.folders,
  offlineFolders: state.offlineFolders,
});

const mapDispatch = (dispatch: Dispatch) => ({
  addFolders: () => dispatch({ type: 'PICK_FOLDERS' }),
  removeFolder: (path: string) => dispatch({ type: 'REMOVE_FOLDER', payload: { path } }),
});

export default connect(mapState, mapDispatch)(FolderManagement);
