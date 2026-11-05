import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RadioQuery, RadioStation } from '@shared/types/radio';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { radioUuidOf } from '../../../domain/radio-track';
import RadioStations from './RadioStations';

const mapState = (state: RootState) => ({
  radio: state.radio,
  currentStation: state.uiState.currentSong ? radioUuidOf(state.uiState.currentSong.path) : undefined,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  search: (query: RadioQuery) => dispatch({ type: 'SEARCH_RADIO', payload: { query } }),
  loadTags: () => dispatch({ type: 'LOAD_RADIO_TAGS', payload: {} }),
  loadOptions: () => dispatch({ type: 'LOAD_RADIO_OPTIONS', payload: {} }),
  play: (station: RadioStation) => dispatch({ type: 'PLAY_RADIO_STATION', payload: { station } }),
});

export default connect(mapState, mapDispatch)(RadioStations);
