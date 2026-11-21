import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import SourceServers from './SourceServers';

const mapState = ({ sources, uiState }: RootState) => ({ state: sources, coverSize: uiState.coverSize });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setCoverSize: (size: number) => dispatch({ type: 'SET_COVER_SIZE', payload: { size } }),
  load: () => dispatch({ type: 'LOAD_SOURCE_SERVERS' }),
  save: (server: Record<string, unknown>) => dispatch({ type: 'SAVE_SOURCE_SERVER', payload: { server } }),
  remove: (id: string) => dispatch({ type: 'REMOVE_SOURCE_SERVER', payload: { id } }),
  discover: () => dispatch({ type: 'DISCOVER_SOURCE_SERVERS' }),
  signInPlex: () => dispatch({ type: 'SIGN_IN_PLEX' }),
  cancelPlexSignIn: () => dispatch({ type: 'CANCEL_PLEX_SIGN_IN' }),
  addPlexServer: (id: string) => dispatch({ type: 'ADD_PLEX_SERVER', payload: { id } }),
  readCertificate: (url: string) => dispatch({ type: 'READ_SOURCE_CERTIFICATE', payload: { url } }),
  clearCertificate: () => dispatch({ type: 'CLEAR_SOURCE_CERTIFICATE' }),
  browse: (request: SourceBrowse) => dispatch({ type: 'BROWSE_SOURCE', payload: { request } }),
  play: (tracks: Track[], track: Track) => {
    dispatch({ type: 'PLAY_TRACKS', payload: { tracks } });
    dispatch({ type: 'PLAY_TRACK', payload: { track } });
  },
});

export default connect(mapState, mapDispatch)(SourceServers);
