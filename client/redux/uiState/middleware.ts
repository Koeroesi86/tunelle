import type { Track } from '@shared/types/library';
import { toRadioTrack } from '../../domain/radio-track';
import { actionMiddleware, onAction } from '../on-action';
import type { Store } from '../on-action';
import type { UiState } from '../types';
import { resolveUpNext } from '../../domain/up-next';

const currentIndexOf = ({ nowPlaying, currentSong }: UiState) => nowPlaying.findIndex((track) => track.path === currentSong?.path);

const pickPrevious = (state: UiState): Track | undefined => {
  const { nowPlaying, repeat, shuffle, played } = state;
  if (shuffle) return played[played.length - 1];

  return nowPlaying[currentIndexOf(state) - 1] ?? (repeat ? nowPlaying[nowPlaying.length - 1] : undefined);
};

const playNext = (store: Store) => {
  const state = store.getState().uiState;

  // shuffle keeps the history with repeat as well, so Previous can step back through it
  if (!state.repeat || state.shuffle) {
    store.dispatch({ type: 'ADD_PLAYED', payload: { track: state.currentSong } });
  }

  const upNext = resolveUpNext(state);
  // with nothing left to play the current song stays and playback stops
  store.dispatch(upNext ? { type: 'PLAY_TRACK', payload: { track: { ...upNext } } } : { type: 'SET_PLAYING', payload: { isPlaying: false } });
};

const playPrevious = (store: Store) => {
  const state = store.getState().uiState;
  const previous = pickPrevious(state);
  if (!previous) return;

  if (state.shuffle) store.dispatch({ type: 'POP_PLAYED', payload: {} });
  store.dispatch({ type: 'PLAY_TRACK', payload: { track: { ...previous } } });
};

const queueMiddleware = actionMiddleware((store) => [
  onAction('TRACK_ENDED', () => store.dispatch({ type: 'NEXT_SONG', payload: {} })),
  onAction('FORCE_PLAY_TRACK', ({ payload }) => {
    store.dispatch({ type: 'CLEAR_PLAYED', payload: {} });
    store.dispatch({ type: 'PLAY_TRACK', payload: { track: payload.track } });
  }),
  onAction('PLAY_RADIO_STATION', ({ payload }) => store.dispatch({ type: 'PLAY_TRACKS', payload: { tracks: [toRadioTrack(payload.station)] } })),
  onAction('NEXT_SONG', () => playNext(store)),
  onAction('PREVIOUS_SONG', () => playPrevious(store)),
  onAction('PLAY_TRACKS', ({ payload }) => store.dispatch({ type: 'PLAY_TRACK', payload: { track: payload.tracks[0] || null } })),
  // with nothing loaded the first track that is added starts playing, as it is the only thing to play
  ...(['ADD_TO_QUEUE', 'PLAY_NEXT'] as const).map((type) =>
    onAction(type, ({ payload }) => {
      const [first] = payload.tracks;
      if (!store.getState().uiState.currentSong && first) store.dispatch({ type: 'PLAY_TRACK', payload: { track: first } });
    })
  ),
  onAction('CLICK_NOTIFICATION', () => store.dispatch({ type: 'SET_TAB', payload: { tab: 'now-playing' } })),
]);

/** Keeps the track that follows the current one in the state after every action, so the player can load it early */
const syncUpNext = (store: Store) => {
  const { uiState } = store.getState();
  const upNext = resolveUpNext(uiState) ?? null;
  if (upNext?.path !== uiState.upNext?.path) store.dispatch({ type: 'SET_UP_NEXT', payload: { track: upNext } });
};

const middleware: typeof queueMiddleware = (store) => {
  const withHandlers = queueMiddleware(store);

  return (next) => {
    const dispatch = withHandlers(next);

    return (action) => {
      const result = dispatch(action);
      syncUpNext(store);
      return result;
    };
  };
};

export default middleware;
