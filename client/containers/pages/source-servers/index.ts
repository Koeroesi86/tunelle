import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import SourceServers from '../../../components/pages/source-servers/SourceServers';

const mapState = ({ sources }: RootState) => ({ state: sources });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  load: () => dispatch({ type: 'LOAD_SOURCE_SERVERS' }),
  save: (server: Record<string, unknown>) => dispatch({ type: 'SAVE_SOURCE_SERVER', payload: { server } }),
  remove: (id: string) => dispatch({ type: 'REMOVE_SOURCE_SERVER', payload: { id } }),
  discover: () => dispatch({ type: 'DISCOVER_SOURCE_SERVERS' }),
  signInPlex: () => dispatch({ type: 'SIGN_IN_PLEX' }),
  cancelPlexSignIn: () => dispatch({ type: 'CANCEL_PLEX_SIGN_IN' }),
  addPlexServer: (id: string) => dispatch({ type: 'ADD_PLEX_SERVER', payload: { id } }),
  readCertificate: (url: string) => dispatch({ type: 'READ_SOURCE_CERTIFICATE', payload: { url } }),
  clearCertificate: () => dispatch({ type: 'CLEAR_SOURCE_CERTIFICATE' }),
});

export default connect(mapState, mapDispatch)(SourceServers);
