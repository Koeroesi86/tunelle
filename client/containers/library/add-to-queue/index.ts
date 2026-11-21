import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { AppAction } from '../../../redux/types';
import AddToQueue from '../../../components/library/add-to-queue/AddToQueue';

const mapDispatch = (dispatch: Dispatch<AppAction>, { next }: { next?: boolean }) => ({
  add: (tracks: Track[]) => dispatch({ type: next ? 'PLAY_NEXT' : 'ADD_TO_QUEUE', payload: { tracks } }),
});

export default connect(undefined, mapDispatch)(AddToQueue);
