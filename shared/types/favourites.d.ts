import type { AlbumSummary, Track } from './library';
import type { RadioStation } from './radio';

export type { FavouriteKey, StoredFavourite, StoredHistoryItem } from '../schemas/favourites';
import type { FavouriteKey } from '../schemas/favourites';

/** What the player knows how to show of a favourite, the snapshot is kept to show it when its source no longer has it */
export type FavouriteSnapshot =
  | { source: 'local'; kind: 'track'; snapshot: Track }
  | { source: 'local'; kind: 'album'; snapshot: AlbumSummary }
  | { source: 'radio'; kind: 'station'; snapshot: RadioStation };

export type NewFavourite = FavouriteKey & FavouriteSnapshot;

export type Favourite = NewFavourite & {
  addedAt: number;
  /** False when the track, album or station is not in its source any more */
  available: boolean;
};

/** What was played: the same items as the favourites, with the time they were played last */
export type HistoryItem = NewFavourite & {
  playedAt: number;
  /** False when the track or station is not in its source any more */
  available: boolean;
};
