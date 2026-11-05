import type { Reducer } from 'redux';
import type { HistoryItem } from '@shared/types/favourites';
import { isAppAction } from '../types';

/** What was played, the last played first; the main process answers with the stored list when something is played */
const reducer: Reducer<HistoryItem[]> = (state = [], action) => {
  if (!isAppAction(action)) return state;

  switch (action.type) {
    case 'HISTORY_LOADED':
      return action.payload.history;
    case 'CLEAR_HISTORY':
      return [];
    default:
      return state;
  }
};

export default reducer;
