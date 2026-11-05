import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { NormalizationMode } from '../../../audio/loudness';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import LoudnessNormalization from './LoudnessNormalization';

const mapState = (state: RootState) => ({ mode: state.uiState.normalization });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setMode: (mode: NormalizationMode) => dispatch({ type: 'SET_NORMALIZATION', payload: { mode } }),
});

export default connect(mapState, mapDispatch)(LoudnessNormalization);
