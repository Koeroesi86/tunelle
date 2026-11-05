import { connect } from 'react-redux';
import type { ConnectedProps } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import { Audio } from '../../client/audio/context';
import HomeView from './HomeView';

const mapState = (state: RootState) => ({
  history: state.history,
  currentSong: state.uiState.currentSong,
  isPlaying: state.uiState.isPlaying,
  currentTime: state.uiState.currentTime,
  favourites: state.favourites,
  playlists: state.playlists,
  hasFolders: state.folders.length > 0,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  playStation: (station: RadioStation) => dispatch({ type: 'PLAY_RADIO_STATION', payload: { station } }),
  clearHistory: () => dispatch({ type: 'CLEAR_HISTORY' }),
  openNowPlaying: () => dispatch({ type: 'SET_TAB', payload: { tab: 'now-playing' } }),
  // the folders are added in the library, where they are listed
  addFolder: () => {
    dispatch({ type: 'SET_VIEW', payload: { view: 'folders' } });
    dispatch({ type: 'SET_TAB', payload: { tab: 'local' } });
  },
});

const connector = connect(mapState, mapDispatch);

// a restored track is paused, and the audio element starts it where it was left, on the page of what plays
const ContextualHomeView = ({ openNowPlaying, ...props }: ConnectedProps<typeof connector>) => (
  <Audio.Consumer>
    {({ play }) => (
      <HomeView
        {...props}
        resume={() => {
          play();
          openNowPlaying();
        }}
      />
    )}
  </Audio.Consumer>
);

export default connector(ContextualHomeView);
