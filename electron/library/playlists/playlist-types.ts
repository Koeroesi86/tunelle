/** One line of a playlist file: where the track is, and what the file says of it */
export interface ParsedEntry {
  location: string;
  title?: string;
  artist?: string;
  album?: string;
  /** Seconds */
  duration?: number;
}

export interface ParsedPlaylist {
  title?: string;
  entries: ParsedEntry[];
}
