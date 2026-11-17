import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import RemoteListener from './RemoteListener';

const mapState = ({ uiState: { remoteListener } }: RootState) => ({ state: remoteListener });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  connect: (host: string, port: number) => dispatch({ type: 'CONNECT_REMOTE_HOST', payload: { host, port } }),
  confirm: (note: string) => dispatch({ type: 'CONFIRM_REMOTE_HOST', payload: { note } }),
  leave: () => dispatch({ type: 'LEAVE_REMOTE_HOST' }),
});

export default connect(mapState, mapDispatch)(RemoteListener);
