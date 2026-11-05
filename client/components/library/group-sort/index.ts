import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { GroupSort as GroupSortValue } from '@shared/types/library-query';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import GroupSort from './GroupSort';

const mapState = (state: RootState) => ({ sort: state.uiState.groupSort });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setSort: (sort: GroupSortValue | undefined) => dispatch({ type: 'SET_GROUP_SORT', payload: { sort } }),
});

export default connect(mapState, mapDispatch)(GroupSort);
