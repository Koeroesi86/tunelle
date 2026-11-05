import type { HistoryItem } from '../types/favourites';
import type { Track } from '../types/library';
import { isShowable } from './favourites';
import { radioUuidOf } from './utils/radio-track';

// an item of a source this version does not know (saved by a newer version) is left out
export const isHistoryItem = (value: unknown): value is HistoryItem => isShowable(value) && typeof value.playedAt === 'number';

/** Whether the item is what the player plays now: the track of that path, or the station of that radio track */
export const isPlayingItem = ({ source, id }: HistoryItem, currentSong: Track | null) =>
  currentSong !== null && (source === 'radio' ? radioUuidOf(currentSong.path) === id : currentSong.path === id);
