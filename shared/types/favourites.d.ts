import type { AlbumSummary, Track } from './library';
import type { RadioStation } from './radio';

/** What is favourited: the source it comes from ('local', 'radio', later a mounted drive or another service), what it is in that source and its id there */
export interface FavouriteKey {
  source: string;
  kind: string;
  id: string;
}

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

/** A favourite as the main process stores it, any source, with the snapshot as it was saved */
export interface StoredFavourite extends FavouriteKey {
  snapshot: unknown;
  addedAt: number;
}

/** What was played: the same items as the favourites, with the time they were played last */
export type HistoryItem = NewFavourite & {
  playedAt: number;
  /** False when the track or station is not in its source any more */
  available: boolean;
};

/** An item of the history as the main process stores it, any source, with the snapshot as it was saved */
export interface StoredHistoryItem extends FavouriteKey {
  snapshot: unknown;
  playedAt: number;
}
