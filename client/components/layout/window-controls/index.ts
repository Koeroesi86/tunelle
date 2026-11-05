import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import WindowControls from './WindowControls';

const mapState = ({ uiState: { maximized } }: RootState) => ({ maximized });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  close: () => dispatch({ type: 'CLOSE_APP', payload: {} }),
  minimize: () => dispatch({ type: 'MINIMIZE_APP', payload: {} }),
  maximize: () => dispatch({ type: 'MAXIMIZE_APP', payload: {} }),
});

export default connect(mapState, mapDispatch)(WindowControls);
