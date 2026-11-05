import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import LauncherIntegration from './LauncherIntegration';

const mapState = ({ uiState: { launcher } }: RootState) => ({ available: launcher.available, enabled: launcher.enabled, external: launcher.external });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setEnabled: (enabled: boolean) => dispatch({ type: 'SET_LAUNCHER', payload: { enabled } }),
});

export default connect(mapState, mapDispatch)(LauncherIntegration);
