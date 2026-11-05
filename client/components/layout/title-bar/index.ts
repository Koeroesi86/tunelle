import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import TitleBar from './TitleBar';

const mapState = ({ uiState: { currentSong, streamTitle, streamArt } }: RootState) => ({ currentSong, streamTitle, streamArt });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  openNowPlaying: () => dispatch({ type: 'SET_TAB', payload: { tab: 'now-playing' } }),
});

export default connect(mapState, mapDispatch)(TitleBar);
