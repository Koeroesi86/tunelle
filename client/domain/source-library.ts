import type { AlbumSummary, GroupSummary } from '@shared/types/library';
import { toSourcePath, type SourceAlbum, type SourceArtist, type SourceKind } from '@shared/schemas/sources';

const coverOf = (source: SourceKind, serverId: string, coverArt: string | undefined) => (coverArt ? toSourcePath({ source, serverId, id: coverArt }) : null);

/** An album of a server as the tile of the library shows it */
export const toAlbumSummary = (source: SourceKind, serverId: string, album: SourceAlbum): AlbumSummary => ({
  id: album.id,
  title: album.title,
  path: toSourcePath({ source, serverId, id: album.id }),
  artist: album.artist,
  cover: coverOf(source, serverId, album.coverArt),
  duration: null,
  year: album.year,
  trackCount: album.songCount ?? 0,
});

/** An artist of a server as the tile of the library shows it */
export const toGroupSummary = (source: SourceKind, serverId: string, artist: SourceArtist): GroupSummary => ({
  key: artist.id,
  name: artist.name,
  albumCount: artist.albumCount ?? 0,
  trackCount: 0,
  cover: coverOf(source, serverId, artist.coverArt),
  covers: [],
});
