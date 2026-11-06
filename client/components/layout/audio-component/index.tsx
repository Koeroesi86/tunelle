import { connect } from 'react-redux';
import type { ConnectedProps } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import AudioComponent from './AudioComponent';
import { Audio } from '../../../audio/context';

const mapState = (state: RootState) => ({
  currentSong: state.uiState.currentSong,
  isPlaying: state.uiState.isPlaying,
  upNext: state.uiState.upNext,
  loudnessStatus: state.uiState.loudnessStatus,
  volume: state.uiState.volume,
  normalization: state.uiState.normalization,
  outputDevice: state.uiState.outputDevice,
  devices: state.uiState.outputDevices,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  trackEnded: () => dispatch({ type: 'TRACK_ENDED', payload: {} }),
});

const connector = connect(mapState, mapDispatch);

const ContextualAudioComponent = (props: ConnectedProps<typeof connector>) => (
  <Audio.Consumer>
    {({ connectNode, connectStandbyNode, activateNode, setNormalization, setOutputDevice, addOutputChangeListener, removeOutputChangeListener }) => (
      <AudioComponent
        {...props}
        connectNode={connectNode}
        connectStandbyNode={connectStandbyNode}
        activateNode={activateNode}
        setNormalization={setNormalization}
        setOutputDevice={setOutputDevice}
        addOutputChangeListener={addOutputChangeListener}
        removeOutputChangeListener={removeOutputChangeListener}
      />
    )}
  </Audio.Consumer>
);

export default connector(ContextualAudioComponent);
