import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import LoudnessPanel from './LoudnessPanel';

const mapState = (state: RootState) => ({ currentTime: state.uiState.currentTime, status: state.uiState.loudnessStatus });

export default connect(mapState)(LoudnessPanel);
