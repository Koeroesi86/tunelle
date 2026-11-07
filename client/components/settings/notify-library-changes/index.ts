import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import NotifyLibraryChanges from './NotifyLibraryChanges';

const mapState = ({ uiState }: RootState) => ({ enabled: uiState.notifyLibraryChanges });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setEnabled: (enabled: boolean) => dispatch({ type: 'SET_NOTIFY_LIBRARY_CHANGES', payload: { enabled } }),
});

export default connect(mapState, mapDispatch)(NotifyLibraryChanges);
