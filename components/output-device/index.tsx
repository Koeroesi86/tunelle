import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { OutputDevice as Device } from '../../client/audio/output-device';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import OutputDevice from './OutputDevice';

const mapState = (state: RootState) => ({ device: state.uiState.outputDevice, devices: state.uiState.outputDevices });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setDevice: (device: Device | undefined) => dispatch({ type: 'SET_OUTPUT_DEVICE', payload: { device } }),
});

export default connect(mapState, mapDispatch)(OutputDevice);
