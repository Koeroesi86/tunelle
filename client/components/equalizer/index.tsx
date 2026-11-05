import { connect } from 'react-redux';
import type { ConnectedProps } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../redux/reducers';
import type { AppAction } from '../../redux/types';
import { Audio } from '../../audio/context';
import Equalizer from './Equalizer';

const mapState = (state: RootState) => ({
  gains: state.uiState.equalizer,
  showFaders: state.uiState.showFaders,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setGain: (index: number, value: number | string) => dispatch({ type: 'SET_GAIN', payload: { index, value } }),
  setGains: (gains: number[]) => dispatch({ type: 'SET_GAINS', payload: { gains } }),
  setShowFaders: (show: boolean) => dispatch({ type: 'SET_SHOW_FADERS', payload: { show } }),
});

const connector = connect(mapState, mapDispatch);

const ContextualEqualizer = (props: ConnectedProps<typeof connector>) => (
  <Audio.Consumer>
    {({ connectToSource, createBiquadFilter, connectDestination, onAudioMounted }) => (
      <Equalizer
        {...props}
        connectToSource={connectToSource}
        createBiquadFilter={createBiquadFilter}
        connectDestination={connectDestination}
        onAudioMounted={onAudioMounted}
      />
    )}
  </Audio.Consumer>
);

export default connector(ContextualEqualizer);
