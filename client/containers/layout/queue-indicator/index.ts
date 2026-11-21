import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import QueueIndicator from '../../../components/layout/queue-indicator/QueueIndicator';

const mapState = ({ uiState: { backgroundTasks } }: RootState) => ({ tasks: backgroundTasks });

export default connect(mapState)(QueueIndicator);
