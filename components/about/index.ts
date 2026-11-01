import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import About from './About';

const mapState = ({ update, uiState: { isPlaying } }: RootState) => ({ update, isPlaying });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  check: () => dispatch({ type: 'CHECK_FOR_UPDATES' }),
  install: () => dispatch({ type: 'INSTALL_UPDATE' }),
  setAutomatic: (enabled: boolean) => dispatch({ type: 'SET_AUTOMATIC_UPDATES', payload: { enabled } }),
  openReleases: () => dispatch({ type: 'OPEN_RELEASES' }),
});

export default connect(mapState, mapDispatch)(About);
