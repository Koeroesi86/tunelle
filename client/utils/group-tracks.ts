import type { Track } from '../../types/library';
import type { AlbumGroup } from '../../types/library-query';
import { fetchAlbum, fetchAlbumPage } from '../services/library-api';
import { pageSize } from '../redux/library/pages';

/** Every track of an artist, album artist or genre in the folders given, album by album */
export const fetchGroupTracks = async (group: AlbumGroup, folders: string[]): Promise<Track[]> => {
  const query = { sort: undefined, folders, search: '', group };
  const first = await fetchAlbumPage(0, query);
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.total / pageSize) - 1) }, (_, page) => fetchAlbumPage(page + 1, query)));
  const albums = [first, ...rest].flatMap(({ items }) => items);

  return (await Promise.all(albums.map(fetchAlbum))).flatMap(({ tracks }) => tracks);
};
