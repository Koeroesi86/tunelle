import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import ReduceMotion from './ReduceMotion';

const mapState = ({ uiState: { reduceMotion } }: RootState) => ({ enabled: reduceMotion });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  toggle: () => dispatch({ type: 'TOGGLE_REDUCE_MOTION', payload: {} }),
});

export default connect(mapState, mapDispatch)(ReduceMotion);
