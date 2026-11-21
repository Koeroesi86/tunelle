import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import RescanButton from '../../../components/library/rescan-button/RescanButton';

const mapState = (state: RootState) => ({
  current: state.uiState.progress,
  total: state.uiState.totalCount,
  scanningFolder: state.uiState.scanningFolder,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  onRescan: () => dispatch({ type: 'RESCAN_LIBRARY', payload: {} }),
});

export default connect(mapState, mapDispatch)(RescanButton);
