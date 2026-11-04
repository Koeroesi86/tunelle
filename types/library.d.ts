/** What a file is encoded as; a row from before the format was read, or a stream that does not tell, has none. The flags are 0 or 1 as the library stores them. */
export interface AudioFormat {
  codec: string | null;
  bitDepth: number | null;
  sampleRate: number | null;
  /** Bits per second */
  bitrate: number | null;
  vbr: number | null;
  lossless: number | null;
}

/** The ReplayGain of a file as its tags say; a file without the tag has none. A gain is in dB, a peak is a ratio of full scale (1 is 0 dBFS). */
export interface Loudness {
  trackGain: number | null;
  albumGain: number | null;
  trackPeak: number | null;
  albumPeak: number | null;
}

export interface Track extends Partial<AudioFormat>, Partial<Loudness> {
  path: string;
  artist: string;
  album: string;
  title: string;
  year: string | number;
  track: string | number;
  disk: string | number;
  genre: string;
  picture: string | null;
  duration: number | null;
  /** The artist the album is listed under, a row from before it was read has none */
  albumArtist?: string | null;
  /** The modification time (ms) and the size (bytes) of the file when its tags were read, a row from before they were kept has none */
  fileModified?: number | null;
  fileSize?: number | null;
}

export interface Album {
  id: string;
  title: string;
  path: string;
  artist: string;
  cover: string | null;
  duration: number | null;
  year: string | number;
  /** The main colour of the cover as `#rrggbb`, none when it has not been picked yet or the cover is grey */
  accent?: string;
  tracks: Track[];
}

/** An album as listed in a window of the library, its tracks are fetched when the album is opened or played; the format is the one of its first track */
export interface AlbumSummary extends Omit<Album, 'tracks'>, Partial<AudioFormat> {
  trackCount: number;
}

/** An artist, an album artist or a genre as listed in a window of the library: the tracks that have the same name (without case, accents and the space around it) */
export interface GroupSummary {
  /** The name as the library compares it, empty for the tracks that have none */
  key: string;
  /** The name as it is written on a track, empty for the tracks that have none */
  name: string;
  albumCount: number;
  trackCount: number;
  cover: string | null;
  /** The main colour of the cover as `#rrggbb`, none for a photo, when it has not been picked yet or when the cover is grey */
  accent?: string;
  /** Up to three covers of its albums, for the genres only (they have no photo) */
  covers: string[];
}

/** One page of a list, together with the length of the whole list */
export interface LibraryPage<T> {
  items: T[];
  total: number;
}

export interface Folder {
  path: string;
  lastModified: number;
}

export interface Query {
  query: string;
  variables: unknown[];
}
