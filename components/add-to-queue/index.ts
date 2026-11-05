import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { AppAction } from '../../client/redux/types';
import AddToQueue from './AddToQueue';

const mapDispatch = (dispatch: Dispatch<AppAction>, { next }: { next?: boolean }) => ({
  add: (tracks: Track[]) => dispatch({ type: next ? 'PLAY_NEXT' : 'ADD_TO_QUEUE', payload: { tracks } }),
});

export default connect(undefined, mapDispatch)(AddToQueue);
