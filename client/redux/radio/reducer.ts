import type { Reducer } from 'redux';
import type { RadioOption, RadioQuery, RadioStation, RadioTag } from '../../../types/radio';
import { isSameRadioQuery, parseRadioQuery } from '../../../types/radio-query';
import { isAppAction } from '../types';

export interface RadioState {
  /** The filters and the sort of the list, the page is apart */
  query: RadioQuery;
  /** Where the loaded page of the stations starts */
  offset: number;
  /** Whether the directory may have stations after the loaded page */
  hasMore: boolean;
  stations: RadioStation[];
  tags: RadioTag[];
  countries: RadioOption[];
  languages: RadioOption[];
  codecs: RadioOption[];
  loading: boolean;
  /** The station that was played last, for what needs more than the radio track knows of it */
  playing?: RadioStation;
  error?: string;
}

const initialState: RadioState = { query: {}, offset: 0, hasMore: false, stations: [], tags: [], countries: [], languages: [], codecs: [], loading: false };

const splitOffset = ({ offset = 0, ...query }: RadioQuery) => ({ query, offset });

// a later page lists what the earlier ones did not, the order of the directory can move between two requests
const append = (stations: RadioStation[], more: RadioStation[]) => [
  ...stations,
  ...more.filter(({ uuid }) => !stations.some((station) => station.uuid === uuid)),
];

const reducer: Reducer<RadioState> = (state = initialState, action) => {
  if (!isAppAction(action)) return state;

  switch (action.type) {
    case 'SEARCH_RADIO':
      return { ...state, ...splitOffset(action.payload.query), loading: true, error: undefined };
    case 'RADIO_STATIONS': {
      const { query, offset } = splitOffset(action.payload.query);
      const { stations, hasMore = false, error } = action.payload;
      // the answer of a search that was replaced in the meantime is dropped
      return !isSameRadioQuery(query, state.query) || offset !== state.offset
        ? state
        : // a failed next page keeps the loaded ones and can be asked for again
          { ...state, stations: offset > 0 ? append(state.stations, stations) : stations, hasMore: error ? offset > 0 : hasMore, error, loading: false };
    }
    // the saved filters and sort are the ones the list opens with
    case 'RESTORE_SETTINGS':
      return 'radioQuery' in action.payload.settings ? { ...state, query: parseRadioQuery(action.payload.settings.radioQuery), offset: 0 } : state;
    case 'PLAY_RADIO_STATION':
      return { ...state, playing: action.payload.station };
    case 'RADIO_TAGS_LOADED':
      return { ...state, tags: action.payload.tags };
    case 'RADIO_OPTIONS_LOADED':
      return { ...state, [action.payload.kind]: action.payload.options };
    default:
      return state;
  }
};

export default reducer;
