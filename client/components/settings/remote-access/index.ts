import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Control } from '@shared/constants/remote-controls';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import RemoteAccess from './RemoteAccess';

const mapState = ({ uiState: { remoteHost } }: RootState) => ({ state: remoteHost });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setEnabled: (enabled: boolean) => dispatch({ type: 'SET_REMOTE_HOST', payload: { enabled } }),
  decide: (deviceId: string, action: 'approve' | 'deny' | 'revoke' | 'block') => dispatch({ type: 'DECIDE_REMOTE_DEVICE', payload: { deviceId, action } }),
  setControls: (deviceId: string, controls: Control[]) => dispatch({ type: 'SET_REMOTE_DEVICE_CONTROLS', payload: { deviceId, controls } }),
});

export default connect(mapState, mapDispatch)(RemoteAccess);
