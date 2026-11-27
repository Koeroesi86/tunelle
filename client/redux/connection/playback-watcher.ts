import { getBackend } from '../../backend/backend';
import type { RootState } from '../reducers';
import type { UiState } from '../types';

const watchedKeys = ['nowPlaying', 'played', 'currentSong', 'shuffle', 'repeat', 'volume'] satisfies (keyof UiState)[];

/** Sends what changed of the playback, for the main process to give back to a page that is loaded again. See docs/app/system-events.md */
export const createPlaybackWatcher = (store: { getState: () => RootState }) => {
  let previous = store.getState().uiState;

  return () => {
    const next = store.getState().uiState;
    const changed = watchedKeys.filter((key) => next[key] !== previous[key]);
    previous = next;
    if (changed.length === 0) return;

    // the position goes with a new track only: the one of the state stands still while the window is hidden
    const keys = changed.includes('currentSong') ? [...changed, 'currentTime' as const] : changed;
    getBackend().send('PLAYBACK_SNAPSHOT', Object.fromEntries(keys.map((key) => [key, next[key]])));
  };
};
