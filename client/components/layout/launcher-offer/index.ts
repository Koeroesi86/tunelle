import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import LauncherOffer from './LauncherOffer';

const mapState = (state: RootState) => state.uiState.launcher;

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setEnabled: (enabled: boolean) => dispatch({ type: 'SET_LAUNCHER', payload: { enabled } }),
});

export default connect(mapState, mapDispatch)(LauncherOffer);
