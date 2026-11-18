import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import RemoteRequest from './RemoteRequest';

const mapState = ({ uiState: { remoteHost } }: RootState) => ({ request: remoteHost?.pending[0], code: remoteHost?.code });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  decide: (deviceId: string, action: 'approve' | 'deny') => dispatch({ type: 'DECIDE_REMOTE_DEVICE', payload: { deviceId, action } }),
});

export default connect(mapState, mapDispatch)(RemoteRequest);
