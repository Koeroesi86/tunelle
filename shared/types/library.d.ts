import type { AlbumSummary, AudioFormat, GroupSummary, Loudness, Track } from '../schemas/library';

export type { AlbumSummary, AudioFormat, GroupSummary, Loudness, Track };

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
