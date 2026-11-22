import type { AlbumSummary, GroupSummary } from '@shared/types/library';
import { toSourcePath, type SourceAlbum, type SourceArtist, type SourceBrowse, type SourceKind } from '@shared/schemas/sources';
import { pageSize } from '../constants/library';

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

/** The request of a page of a list: only a library list is in pages, the others are one answer */
export const pageRequest = (request: SourceBrowse, page: number): SourceBrowse =>
  request.what === 'library' ? { ...request, start: page * pageSize, size: pageSize } : request;

/** The key of a request in the failures of the browses */
export const browseKey = (request: SourceBrowse) => JSON.stringify(request);
