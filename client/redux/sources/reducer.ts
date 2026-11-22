import type { Reducer } from 'redux';
import { browseKey } from '../../domain/source-library';
import type { SourceBrowsed, SourceServersState } from '../../domain/source-servers-state';
import { isAppAction } from '../types';
import { markListsStale, noSourceLists, storeAnswer } from './lists';
import type { SourceLists } from './lists';

export interface SourcesState extends SourceServersState {
  /** The failures of the browses by their request */
  browsed: SourceBrowsed;
  /** The answers as the lists of the library views */
  lists: SourceLists;
}

const initialState: SourcesState = { servers: [], saving: false, browsed: {}, lists: noSourceLists };

const without = (browsed: SourcesState['browsed'], key: string) => Object.fromEntries(Object.entries(browsed).filter(([known]) => known !== key));

const reducer: Reducer<SourcesState> = (state = initialState, action) => {
  if (!isAppAction(action)) return state;

  switch (action.type) {
    case 'SOURCE_SERVERS_LOADED':
      return {
        ...state,
        servers: action.payload.servers,
        lists: markListsStale(state.lists),
        saving: false,
        plexAccount: undefined,
        failure: undefined,
        certificate: undefined,
      };
    case 'SAVE_SOURCE_SERVER':
      return { ...state, saving: true, failure: undefined };
    case 'SOURCE_SERVER_FAILED':
      return { ...state, saving: false, failure: action.payload };
    case 'READ_SOURCE_CERTIFICATE':
      return { ...state, failure: undefined };
    case 'SOURCE_CERTIFICATE_READ':
      return { ...state, certificate: action.payload };
    case 'CLEAR_SOURCE_CERTIFICATE':
      return { ...state, certificate: undefined };
    case 'DISCOVER_SOURCE_SERVERS':
      return { ...state, discovery: { searching: true, servers: [] } };
    case 'SOURCE_SERVERS_DISCOVERED':
      return { ...state, discovery: { searching: false, ...action.payload } };
    case 'SIGN_IN_PLEX':
      return { ...state, plexAccount: { status: 'waiting' }, failure: undefined };
    case 'CANCEL_PLEX_SIGN_IN':
      return { ...state, plexAccount: undefined };
    case 'PLEX_ACCOUNT':
      return { ...state, plexAccount: action.payload };
    case 'ADD_PLEX_SERVER':
      return { ...state, saving: true, failure: undefined };
    case 'BROWSE_SOURCE':
      return { ...state, browsed: without(state.browsed, browseKey(action.payload.request)) };
    case 'SOURCE_BROWSED': {
      const { request, result, error } = action.payload;
      return { ...state, browsed: { ...state.browsed, [browseKey(request)]: { error } }, lists: storeAnswer(state.lists, state.servers, request, result) };
    }
    default:
      return state;
  }
};

export default reducer;
