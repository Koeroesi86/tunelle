import type { Track } from './library';

/** One place of a track in a playlist, the same track can be in a playlist more than once */
export interface PlaylistEntry {
  id: number;
  track: Track;
  /** False when the library no longer has the file of the track */
  available: boolean;
}

export interface Playlist {
  id: number;
  name: string;
  entries: PlaylistEntry[];
}

/** A playlist as the main process stores it, the snapshots are as they were saved */
export interface StoredPlaylist {
  id: number;
  name: string;
  entries: { id: number; path: string; snapshot: unknown }[];
}

/** A playlist as the main process sends it, the track is as it was saved and the window checks it before it shows it */
export interface PlaylistMessage {
  id: number;
  name: string;
  entries: { id: number; track: unknown; available: boolean }[];
}
