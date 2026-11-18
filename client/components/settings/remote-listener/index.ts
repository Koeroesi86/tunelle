import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import type { Track } from '@shared/types/library';
import { toRemoteTrack } from '../../../domain/remote-track';
import type { NowPlaying } from '@shared/schemas/now-playing';
import type { ControlCommand } from '@shared/schemas/remote-control';
import RemoteListener from './RemoteListener';

const mapState = ({ uiState: { remoteListener, remoteNearby } }: RootState) => ({ state: remoteListener, nearby: remoteNearby });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  connect: (host: string, port: number) => dispatch({ type: 'CONNECT_REMOTE_HOST', payload: { host, port } }),
  confirm: (note: string) => dispatch({ type: 'CONFIRM_REMOTE_HOST', payload: { note } }),
  listenAlong: (snapshot: Exclude<NowPlaying, { state: 'idle' }>) => {
    const track: Track = toRemoteTrack(snapshot);
    dispatch({ type: 'PLAY_TRACKS', payload: { tracks: [track] } });
    dispatch({ type: 'PLAY_TRACK', payload: { track } });
  },
  browse: (active: boolean) => dispatch({ type: 'BROWSE_REMOTE_NEARBY', payload: { active } }),
  control: (command: ControlCommand) => dispatch({ type: 'SEND_REMOTE_CONTROL', payload: command }),
  leave: () => dispatch({ type: 'LEAVE_REMOTE_HOST' }),
});

export default connect(mapState, mapDispatch)(RemoteListener);
