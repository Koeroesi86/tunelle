import { z } from 'zod';
import type { GroupKind } from '@shared/types/library-query';
import type { SourceKind } from '@shared/schemas/sources';

export const libraryViewSchema = z.enum(['albums', 'artists', 'albumArtists', 'genres', 'tracks', 'folders']);

/** A page of the online group: the radio, the page of a kind of server to add and remove them, the nearby devices, or one section of the library of a kind (`plex:albums`) */
export const onlineViewSchema = z.union([
  z.enum(['radio', 'servers', 'jellyfin', 'plex', 'nearby']),
  z.templateLiteral([z.enum(['subsonic', 'jellyfin', 'plex']), ':', z.enum(['albums', 'artists', 'tracks'])]),
]);

export type LibraryView = z.infer<typeof libraryViewSchema>;
export type OnlineView = z.infer<typeof onlineViewSchema>;

/** The artist, album artist or genre the library view has opened, to show its albums */
export interface OpenGroup {
  kind: GroupKind;
  /** The name as the library compares it, empty for the tracks that have none */
  key: string;
  /** The name as it is written, empty for the tracks that have none */
  name: string;
}

/** The side of the favourites that is shown, and the order it is listed in */
export type FavouritesSource = 'local' | 'online';
export type FavouritesOrder = 'recent' | 'name' | 'details';

/** The groups of the sidebar that open and close */
export type NavigationGroup = 'library' | 'online' | 'playlists' | SourceKind;
export type Tab = 'home' | 'now-playing' | 'local' | 'online-sources' | 'favourites' | 'playlist' | 'equalizer' | 'settings';
