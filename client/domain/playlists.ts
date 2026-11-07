import type { AlbumSummary, Album, Track } from '@shared/types/library';
import type { Playlist } from '@shared/types/playlists';
import { fetchAlbum } from '../services/library-api';
import { z } from 'zod';
import { storedPlaylistSchema } from '@shared/schemas/playlists';

/** What the player shows of a track of a playlist, the rest of a snapshot is not needed */
const trackSchema = z.custom<Track>((value) => z.looseObject({ path: z.string(), title: z.string() }).safeParse(value).success);

const entrySchema = z.object({
  id: z.number(),
  track: trackSchema,
  available: z
    .unknown()
    .optional()
    .transform((available) => available === true),
});

const playlistMessageSchema = storedPlaylistSchema.pick({ id: true, name: true }).extend({
  entries: z.array(z.unknown()).transform((entries) => entries.flatMap((entry) => entrySchema.safeParse(entry).data ?? [])),
});

/** The playlist of a message, without the entries whose track the player cannot show; none for a message that is not a playlist */
export const toPlaylist = (message: unknown): Playlist[] => [playlistMessageSchema.safeParse(message).data].filter((playlist) => playlist !== undefined);

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
