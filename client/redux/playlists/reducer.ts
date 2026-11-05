import type { Reducer } from 'redux';
import type { Playlist } from '@shared/types/playlists';
import { isAppAction } from '../types';

/** The playlists in the order the sidebar lists them, as the main process stores them: every change is answered with the stored list */
const reducer: Reducer<Playlist[]> = (state = [], action) => {
  if (!isAppAction(action)) return state;

  return action.type === 'PLAYLISTS_LOADED' ? action.payload.playlists : state;
};

export default reducer;
