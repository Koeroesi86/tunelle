import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../redux/reducers';
import type { AppAction } from '../../redux/types';
import LibrarySearch from '../library-search/LibrarySearch';

/** The field of the header on the lists of artists, album artists and genres: it filters their names, the library search does not reach them */
const mapState = (state: RootState) => ({ search: state.uiState.groupFilter });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setSearch: (filter: string) => dispatch({ type: 'SET_GROUP_FILTER', payload: { filter } }),
});

export default connect(mapState, mapDispatch)(LibrarySearch);
