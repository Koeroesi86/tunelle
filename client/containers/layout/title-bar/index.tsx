import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import TitleBar from '../../../components/layout/title-bar/TitleBar';
import type { TitleBarSlot } from '../../../components/layout/player-home/PlayerHome';
import QueueIndicator from '../queue-indicator';
import WindowControls from '../window-controls';

const actions = (
  <>
    <QueueIndicator />
    <WindowControls />
  </>
);

const mapState = ({ uiState: { currentSong, streamTitle, streamArt } }: RootState) => ({ currentSong, streamTitle, streamArt });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  openNowPlaying: () => dispatch({ type: 'SET_TAB', payload: { tab: 'now-playing' } }),
});

export default connect(mapState, mapDispatch, (state, dispatch, slot: TitleBarSlot) => ({ ...slot, ...state, ...dispatch, actions }))(TitleBar);
