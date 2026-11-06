import { useContext } from 'react';
import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import { Audio } from '../../../audio/context';
import { useOutputSampleRate } from '../../../hooks/use-output-sample-rate';
import LoudnessPanel from './LoudnessPanel';

const mapState = (state: RootState) => ({ currentTime: state.uiState.currentTime, status: state.uiState.loudnessStatus });

const ContextualLoudnessPanel = (props: Omit<Parameters<typeof LoudnessPanel>[0], 'outputRate'>) => {
  const outputRate = useOutputSampleRate(useContext(Audio));
  return <LoudnessPanel {...props} outputRate={outputRate} />;
};

export default connect(mapState)(ContextualLoudnessPanel);
