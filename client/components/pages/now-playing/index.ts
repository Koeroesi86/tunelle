import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import NowPlaying from './NowPlaying';

const mapState = (state: RootState) => ({
  streamTitle: state.uiState.streamTitle,
  streamArt: state.uiState.streamArt,
  streamSampleRate: state.uiState.streamSampleRate,
  isPlaying: state.uiState.isPlaying,
  station: state.radio.playing,
  currentSong: state.uiState.currentSong,
  nowPlaying: state.uiState.nowPlaying,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTrack: (track: Track) => dispatch({ type: 'FORCE_PLAY_TRACK', payload: { track } }),
  moveTrack: (from: number, to: number) => dispatch({ type: 'MOVE_QUEUE_TRACK', payload: { from, to } }),
  removeTrack: (index: number) => dispatch({ type: 'REMOVE_FROM_QUEUE', payload: { index } }),
  clearQueue: () => dispatch({ type: 'CLEAR_QUEUE', payload: {} }),
  openLibrary: () => dispatch({ type: 'SET_TAB', payload: { tab: 'local' } }),
});

export default connect(mapState, mapDispatch)(NowPlaying);
