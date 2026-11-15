import type { Track } from './library';

export interface PlaylistFile {
  path: string;
  sync: boolean;
  encoding?: string;
  encodingOverride?: string;
  canUndo: boolean;
}

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
  /** The playlist file this playlist was imported from, whether a change is written back to it, the encoding it was read with (and the one the user chose, if any), and whether the last read can be undone */
  file?: PlaylistFile;
}

export type { PlaylistImportReport, StoredPlaylist } from '../schemas/playlists';

/** A playlist as the main process sends it, the track is as it was saved and the window checks it before it shows it */
export interface PlaylistMessage {
  id: number;
  name: string;
  entries: { id: number; track: unknown; available: boolean }[];
  file?: PlaylistFile;
}
