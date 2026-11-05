import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { AlbumSort as AlbumSortValue } from '@shared/types/library-query';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import AlbumSort from './AlbumSort';

const mapState = (state: RootState) => ({ sort: state.uiState.albumSort });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setSort: (sort: AlbumSortValue | undefined) => dispatch({ type: 'SET_ALBUM_SORT', payload: { sort } }),
});

export default connect(mapState, mapDispatch)(AlbumSort);
