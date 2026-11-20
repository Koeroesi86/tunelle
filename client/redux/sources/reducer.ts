import type { Reducer } from 'redux';
import type { DiscoveredServer, SourceBrowse, SourceBrowseResult, SourceServerInfo } from '@shared/schemas/sources';
import { isAppAction } from '../types';

export interface SourcesState {
  servers: SourceServerInfo[];
  /** A server is being checked and kept */
  saving: boolean;
  failure?: { id?: string; error: string; code?: number };
  /** The certificate of a server that the user is asked to approve */
  certificate?: { url: string; certificate: string; code: string };
  /** The Jellyfin servers that answered on the network: `searching` until they did */
  discovery?: { searching: boolean; servers: DiscoveredServer[]; error?: string };
  /** The answers of the browses by their request, a request without an answer is loading */
  browsed: Record<string, { result?: SourceBrowseResult; error?: string }>;
}

const initialState: SourcesState = { servers: [], saving: false, browsed: {} };

/** The key of a request in `browsed` */
export const browseKey = (request: SourceBrowse) => JSON.stringify(request);

const without = (browsed: SourcesState['browsed'], key: string) => Object.fromEntries(Object.entries(browsed).filter(([known]) => known !== key));

const reducer: Reducer<SourcesState> = (state = initialState, action) => {
  if (!isAppAction(action)) return state;

  switch (action.type) {
    case 'SOURCE_SERVERS_LOADED':
      return { ...state, servers: action.payload.servers, saving: false, failure: undefined, certificate: undefined };
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
    case 'BROWSE_SOURCE':
      return { ...state, browsed: without(state.browsed, browseKey(action.payload.request)) };
    case 'SOURCE_BROWSED': {
      const { request, result, error } = action.payload;
      return { ...state, browsed: { ...state.browsed, [browseKey(request)]: { result, error } } };
    }
    default:
      return state;
  }
};

export default reducer;
