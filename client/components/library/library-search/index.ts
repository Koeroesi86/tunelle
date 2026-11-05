import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import LibrarySearch from './LibrarySearch';

const mapState = (state: RootState) => ({ search: state.uiState.librarySearch });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setSearch: (search: string) => dispatch({ type: 'SET_LIBRARY_SEARCH', payload: { search } }),
});

export default connect(mapState, mapDispatch)(LibrarySearch);
