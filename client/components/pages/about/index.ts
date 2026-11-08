import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import About from './About';

const mapState = ({ update, uiState: { isPlaying } }: RootState) => ({ update, isPlaying });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  check: () => dispatch({ type: 'CHECK_FOR_UPDATES' }),
  confirmMetered: () => dispatch({ type: 'CONFIRM_METERED_UPDATE' }),
  cancelMetered: () => dispatch({ type: 'CANCEL_METERED_UPDATE' }),
  setAllowMetered: (enabled: boolean) => dispatch({ type: 'SET_ALLOW_METERED_UPDATES', payload: { enabled } }),
  install: () => dispatch({ type: 'INSTALL_UPDATE' }),
  setAutomatic: (enabled: boolean) => dispatch({ type: 'SET_AUTOMATIC_UPDATES', payload: { enabled } }),
  openReleases: () => dispatch({ type: 'OPEN_RELEASES' }),
});

export default connect(mapState, mapDispatch)(About);
