import type { Reducer } from 'redux';
import type { Folder } from '@shared/types/library';
import { isAppAction } from '../types';

const reducer: Reducer<Folder[]> = (state = [], action) => {
  if (!isAppAction(action)) return state;

  if (action.type === 'STORE_FOLDERS') {
    return action.payload.folders;
  }

  return state;
};

export default reducer;
