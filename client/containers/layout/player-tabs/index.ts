import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import PlayerTabs from '../../../components/layout/player-tabs/PlayerTabs';

const mapState = (state: RootState) => ({
  tab: state.uiState.tab,
});

export default connect(mapState)(PlayerTabs);
