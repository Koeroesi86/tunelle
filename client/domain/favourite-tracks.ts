import type { NewFavourite } from '@shared/types/favourites';
import type { Track } from '@shared/types/library';

/** What a favourite or an item of the history needs to be played */
export type Playable = NewFavourite & { available: boolean };

/** The tracks to play for a favourite: the track itself, the tracks of an album or the stream of a station; none when the source no longer has it */
export type GetFavouriteTracks = (favourites: Playable[]) => Promise<Track[]>;
