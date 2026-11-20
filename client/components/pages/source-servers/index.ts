import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import SourceServers from './SourceServers';

const mapState = ({ sources }: RootState) => ({ state: sources });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  load: () => dispatch({ type: 'LOAD_SOURCE_SERVERS' }),
  save: (server: Record<string, unknown>) => dispatch({ type: 'SAVE_SOURCE_SERVER', payload: { server } }),
  remove: (id: string) => dispatch({ type: 'REMOVE_SOURCE_SERVER', payload: { id } }),
  readCertificate: (url: string) => dispatch({ type: 'READ_SOURCE_CERTIFICATE', payload: { url } }),
  clearCertificate: () => dispatch({ type: 'CLEAR_SOURCE_CERTIFICATE' }),
  browse: (request: SourceBrowse) => dispatch({ type: 'BROWSE_SOURCE', payload: { request } }),
  play: (tracks: Track[], track: Track) => {
    dispatch({ type: 'PLAY_TRACKS', payload: { tracks } });
    dispatch({ type: 'PLAY_TRACK', payload: { track } });
  },
});

export default connect(mapState, mapDispatch)(SourceServers);
