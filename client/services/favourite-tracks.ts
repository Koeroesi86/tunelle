import type { Track } from '@shared/types/library';
import type { GetFavouriteTracks, Playable } from '../domain/favourite-tracks';
import { toRadioTrack } from '../domain/radio-track';
import { fetchAlbum } from './library-api';

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
export const getFavouriteTracks: GetFavouriteTracks = (favourites) =>
  Promise.all(favourites.map((favourite) => tracksOf(favourite))).then((tracks) => tracks.flat());
