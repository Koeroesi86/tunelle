import type { Track } from '@shared/types/library';
import type { UiState } from '../redux/types';

type QueueState = Pick<UiState, 'nowPlaying' | 'currentSong' | 'repeat' | 'shuffle' | 'played' | 'upNext'>;

const sequentialNext = ({ nowPlaying, currentSong, repeat }: QueueState): Track | undefined => {
  const index = nowPlaying.findIndex(({ path }) => path === currentSong?.path);

  return nowPlaying[index + 1] ?? (repeat ? nowPlaying[0] : undefined);
};

// the track that was chosen stays while it is still a valid pick, so the next track does not change under a player that loaded it
const shuffledNext = ({ nowPlaying, currentSong, repeat, played, upNext }: QueueState): Track | undefined => {
  const heard = new Set((repeat ? [] : played).map(({ path }) => path));
  const candidates = nowPlaying.filter(({ path }) => path !== currentSong?.path && !heard.has(path));
  const kept = candidates.find(({ path }) => path === upNext?.path);
  const current = nowPlaying.find(({ path }) => path === currentSong?.path);

  return kept ?? candidates[Math.floor(Math.random() * candidates.length)] ?? (repeat ? current : undefined);
};

/** The track that follows the current one, undefined when the queue ends there */
export const resolveUpNext = (state: QueueState): Track | undefined => (state.shuffle ? shuffledNext(state) : sequentialNext(state));
