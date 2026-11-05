import type { AlbumSummary, Album, Track } from '../types/library';
import type { Playlist } from '../types/playlists';
import { fetchAlbum } from './services/library-api';
import { isRecord } from '../shared/utils/is-record';

/** What the player shows of a track of a playlist, the rest of a snapshot is not needed */
const isTrack = (value: unknown): value is Track => isRecord(value) && typeof value.path === 'string' && typeof value.title === 'string';

const toEntry = (entry: unknown) =>
  isRecord(entry) && typeof entry.id === 'number' && isTrack(entry.track) ? [{ id: entry.id, track: entry.track, available: entry.available === true }] : [];

/** The playlist of a message, without the entries whose track the player cannot show; none for a message that is not a playlist */
export const toPlaylist = (message: unknown): Playlist[] =>
  isRecord(message) && typeof message.id === 'number' && typeof message.name === 'string' && Array.isArray(message.entries)
    ? [{ id: message.id, name: message.name, entries: message.entries.flatMap(toEntry) }]
    : [];

/** The tracks to play for a playlist: the ones the library still has, in the order of the playlist */
export const getPlaylistTracks = ({ entries }: Playlist): Track[] => entries.filter(({ available }) => available).map(({ track }) => track);

/** What can be added to a playlist: a track, an album of the library or an album with its tracks */
export type PlaylistSource = Track | AlbumSummary | Album;

/** The tracks of what is added, an album gives all its tracks */
export const getSourceTracks = (source: PlaylistSource): Promise<Track[]> => {
  // an album has a path too, a cover and no picture
  if ('picture' in source) return Promise.resolve([source]);
  if ('tracks' in source) return Promise.resolve(source.tracks);

  return fetchAlbum(source).then(({ tracks }) => tracks);
};
