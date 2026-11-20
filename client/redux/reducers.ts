import { combineReducers } from 'redux';
import offlineFolders from './offline-folders/reducer';
import library from './library/reducer';
import favourites from './favourites/reducer';
import history from './history/reducer';
import playlists from './playlists/reducer';
import folders from './folders/reducer';
import radio from './radio/reducer';
import sources from './sources/reducer';
import update from './update/reducer';
import uiState from './uiState/reducer';

const reducers = combineReducers({
  favourites,
  history,
  playlists,
  folders,
  library,
  offlineFolders,
  radio,
  sources,
  uiState,
  update,
});

export type RootState = ReturnType<typeof reducers>;

export default reducers;
