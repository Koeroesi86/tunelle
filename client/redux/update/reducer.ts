import type { Reducer } from 'redux';
import type { UpdateState } from '@shared/types/update';
import { isAppAction } from '../types';

/** What the main process last told about the installed version and its updates, null until it answered */
const reducer: Reducer<UpdateState | null> = (state = null, action) => {
  if (!isAppAction(action)) return state;

  return action.type === 'UPDATE_STATE' ? action.payload : state;
};

export default reducer;
