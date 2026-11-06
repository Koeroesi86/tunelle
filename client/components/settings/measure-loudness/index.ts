import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import MeasureLoudness from './MeasureLoudness';

const mapState = ({ uiState }: RootState) => ({ enabled: uiState.measureLoudness, status: uiState.loudnessStatus });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setEnabled: (enabled: boolean) => dispatch({ type: 'SET_MEASURE_LOUDNESS', payload: { enabled } }),
  loadStatus: () => dispatch({ type: 'LOAD_LOUDNESS_STATUS', payload: {} }),
  clear: () => dispatch({ type: 'CLEAR_MEASURED_LOUDNESS', payload: {} }),
});

export default connect(mapState, mapDispatch)(MeasureLoudness);
