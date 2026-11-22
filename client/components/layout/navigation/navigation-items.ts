import {
  MdAlbum as AlbumsIcon,
  MdAudiotrack as TracksIcon,
  MdFolder as FoldersIcon,
  MdGroup as AlbumArtistsIcon,
  MdLocalOffer as GenresIcon,
  MdPerson as ArtistsIcon,
} from 'react-icons/md';
import type { SourceKind } from '@shared/schemas/sources';

/** The views of the library group of the sidebar, which its welcome page lists as well */
export const libraryViews = [
  { view: 'albums', label: 'library.albums', Icon: AlbumsIcon },
  { view: 'artists', label: 'library.artists', Icon: ArtistsIcon },
  { view: 'albumArtists', label: 'library.albumArtists', Icon: AlbumArtistsIcon },
  { view: 'genres', label: 'library.genres', Icon: GenresIcon },
  { view: 'tracks', label: 'library.songs', Icon: TracksIcon },
  { view: 'folders', label: 'library.folders', Icon: FoldersIcon },
] as const;

/** A provider is a group of the online part of the sidebar: the page where its servers are added, and the sections of its library once it has a server */
export const providers = [
  { kind: 'subsonic', serversView: 'servers' },
  { kind: 'jellyfin', serversView: 'jellyfin' },
  { kind: 'plex', serversView: 'plex' },
] as const;

export const sourceNames: Record<SourceKind, string> = { subsonic: 'Subsonic', jellyfin: 'Jellyfin', plex: 'Plex' };

export const sectionViews = [
  { section: 'albums', label: 'library.albums', Icon: AlbumsIcon },
  { section: 'artists', label: 'library.artists', Icon: ArtistsIcon },
  { section: 'tracks', label: 'library.songs', Icon: TracksIcon },
] as const;
