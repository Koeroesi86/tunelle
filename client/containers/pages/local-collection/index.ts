import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction, LibraryView } from '../../../redux/types';
import LocalCollection from '../../../components/pages/local-collection/LocalCollection';

const mapState = (state: RootState) => ({
  view: state.uiState.view,
  groupOpen: state.uiState.openGroup !== undefined,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setView: (view: LibraryView) => dispatch({ type: 'SET_VIEW', payload: { view } }),
});

export default connect(mapState, mapDispatch)(LocalCollection);
