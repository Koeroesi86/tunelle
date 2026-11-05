import type { Reducer } from 'redux';
import type { Favourite } from '@shared/types/favourites';
import { isSameFavourite } from '../../utils/favourites';
import { isAppAction } from '../types';

/** The newest first; a mark shows at once and the main process answers with the stored list */
const reducer: Reducer<Favourite[]> = (state = [], action) => {
  if (!isAppAction(action)) return state;

  switch (action.type) {
    case 'FAVOURITES_LOADED':
      return action.payload.favourites;
    case 'ADD_FAVOURITE': {
      const { favourite } = action.payload;
      return state.some((existing) => isSameFavourite(existing, favourite)) ? state : [{ ...favourite, addedAt: Date.now(), available: true }, ...state];
    }
    case 'REMOVE_FAVOURITE':
      return state.filter((favourite) => !isSameFavourite(favourite, action.payload.key));
    default:
      return state;
  }
};

export default reducer;
