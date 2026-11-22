import type { Track } from '@shared/types/library';
import type { PlaylistSource } from '../domain/playlists';
import { fetchAlbum } from './library-api';

/** The tracks of what is added, an album gives all its tracks */
export const getSourceTracks = (source: PlaylistSource): Promise<Track[]> => {
  // an album has a path too, a cover and no picture
  if ('picture' in source) return Promise.resolve([source]);
  if ('tracks' in source) return Promise.resolve(source.tracks);

  return fetchAlbum(source).then(({ tracks }) => tracks);
};
