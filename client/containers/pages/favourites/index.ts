import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import type { RootState } from '../../../redux/reducers';
import type { AppAction, FavouritesOrder, FavouritesSource } from '../../../redux/types';
import { getFavouriteTracks } from '../../../domain/favourite-tracks';
import { renderFavourite } from '../../ui/render-favourite';
import FavouritesView from '../../../components/pages/favourites/FavouritesView';

const mapState = (state: RootState) => ({
  favourites: state.favourites,
  source: state.uiState.favouritesSource,
  order: state.uiState.favouritesOrder,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  setSource: (source: FavouritesSource) => dispatch({ type: 'SET_FAVOURITES_SOURCE', payload: { source } }),
  setOrder: (order: FavouritesOrder) => dispatch({ type: 'SET_FAVOURITES_ORDER', payload: { order } }),
  renderFavourite,
  getFavouriteTracks,
  addToQueue: (tracks: Track[], next: boolean) => dispatch({ type: next ? 'PLAY_NEXT' : 'ADD_TO_QUEUE', payload: { tracks } }),
  playStation: (station: RadioStation) => dispatch({ type: 'PLAY_RADIO_STATION', payload: { station } }),
});

export default connect(mapState, mapDispatch)(FavouritesView);
