import { connect } from 'react-redux';
import type { ConnectedProps } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { Audio } from '../../../audio/context';
import PlayerIntegrations from './PlayerIntegrations';

const mapState = (state: RootState) => ({
  isPlaying: state.uiState.isPlaying,
  volume: state.uiState.volume,
  currentTime: state.uiState.currentTime,
  currentSong: state.uiState.currentSong,
  upNext: state.uiState.upNext,
  streamTitle: state.uiState.streamTitle,
  streamArt: state.uiState.streamArt,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setCurrentTime: (currentTime: number) => dispatch({ type: 'SET_CURRENT_TIME', payload: { currentTime } }),
  setVolume: (volume: number | string) => dispatch({ type: 'SET_VOLUME', payload: { volume } }),
  nextSong: () => dispatch({ type: 'NEXT_SONG', payload: {} }),
  previousSong: () => dispatch({ type: 'PREVIOUS_SONG', payload: {} }),
});

const connector = connect(mapState, mapDispatch);

const ContextualPlayerIntegrations = (props: ConnectedProps<typeof connector>) => (
  <Audio.Consumer>{({ play, pause }) => <PlayerIntegrations {...props} play={play} pause={pause} />}</Audio.Consumer>
);

export default connector(ContextualPlayerIntegrations);
