import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { FavouriteKey, NewFavourite } from '@shared/types/favourites';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import { isFavourited } from '../../client/utils/favourites';
import FavouriteButton from './FavouriteButton';

const mapState = (state: RootState, { item }: { item: NewFavourite }) => ({
  active: isFavourited(state.favourites, item),
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  add: (favourite: NewFavourite) => dispatch({ type: 'ADD_FAVOURITE', payload: { favourite } }),
  remove: (key: FavouriteKey) => dispatch({ type: 'REMOVE_FAVOURITE', payload: { key } }),
});

export default connect(mapState, mapDispatch)(FavouriteButton);
