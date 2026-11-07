import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import QueueIndicator from './QueueIndicator';

const mapState = ({ uiState: { backgroundTasks } }: RootState) => ({ tasks: backgroundTasks });

export default connect(mapState)(QueueIndicator);
