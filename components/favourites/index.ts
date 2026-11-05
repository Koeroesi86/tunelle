import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction, FavouritesOrder, FavouritesSource } from '../../client/redux/types';
import FavouritesView from './FavouritesView';

const mapState = (state: RootState) => ({
  favourites: state.favourites,
  source: state.uiState.favouritesSource,
  order: state.uiState.favouritesOrder,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  setSource: (source: FavouritesSource) => dispatch({ type: 'SET_FAVOURITES_SOURCE', payload: { source } }),
  setOrder: (order: FavouritesOrder) => dispatch({ type: 'SET_FAVOURITES_ORDER', payload: { order } }),
  playStation: (station: RadioStation) => dispatch({ type: 'PLAY_RADIO_STATION', payload: { station } }),
});

export default connect(mapState, mapDispatch)(FavouritesView);
