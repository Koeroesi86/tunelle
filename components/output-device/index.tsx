import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { OutputDevice as Device } from '../../client/audio/output-device';
import { useOutputDevices } from '../../client/hooks/use-output-devices';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import OutputDevice from './OutputDevice';

const mapState = (state: RootState) => ({ device: state.uiState.outputDevice });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setDevice: (device: Device | undefined) => dispatch({ type: 'SET_OUTPUT_DEVICE', payload: { device } }),
});

const Connected = connect(mapState, mapDispatch)(OutputDevice);

const OutputDeviceSetting = () => <Connected devices={useOutputDevices()} />;

export default OutputDeviceSetting;
