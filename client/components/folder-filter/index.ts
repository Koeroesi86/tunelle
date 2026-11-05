import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../redux/reducers';
import type { AppAction } from '../../redux/types';
import FolderFilter from './FolderFilter';

const mapState = (state: RootState) => ({ folders: state.folders, selected: state.uiState.libraryFolders });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setSelected: (folders: string[]) => dispatch({ type: 'SET_LIBRARY_FOLDERS', payload: { folders } }),
});

export default connect(mapState, mapDispatch)(FolderFilter);
