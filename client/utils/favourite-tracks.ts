import type { NewFavourite } from '@shared/types/favourites';
import type { Track } from '@shared/types/library';
import { fetchAlbum } from '../services/library-api';
import { toRadioTrack } from './radio-track';

/** The tracks to play for a favourite: the track itself, the tracks of an album or the stream of a station; none when the source no longer has it */
/** What a favourite or an item of the history needs to be played */
type Playable = NewFavourite & { available: boolean };

const tracksOf = (favourite: Playable): Promise<Track[]> => {
  if (!favourite.available) return Promise.resolve([]);

  switch (favourite.kind) {
    case 'track':
      return Promise.resolve([favourite.snapshot]);
    case 'album':
      return fetchAlbum(favourite.snapshot).then(({ tracks }) => tracks);
    default:
      return Promise.resolve([toRadioTrack(favourite.snapshot)]);
  }
};

/** The tracks of the favourites in their order, the ones that are not available are left out */
export const getFavouriteTracks = (favourites: Playable[]): Promise<Track[]> =>
  Promise.all(favourites.map((favourite) => tracksOf(favourite))).then((tracks) => tracks.flat());
