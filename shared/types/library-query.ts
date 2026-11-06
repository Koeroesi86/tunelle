import { z } from 'zod';

/** The fields the tracks can be sorted by; a sort from outside is checked against these and never put into a query as it is */
const trackSortFieldSchema = z.enum(['title', 'artist', 'album', 'year', 'duration', 'track']);

/** The fields the albums can be sorted by, artist and year are the ones of the first track of the album */
const albumSortFieldSchema = z.enum(['title', 'artist', 'year', 'trackCount', 'duration']);

/** What the library can be browsed by: the artist of the tracks, the album artist and the genre */
const groupKindSchema = z.enum(['artist', 'albumArtist', 'genre']);

/** The fields the artists, the album artists and the genres can be sorted by */
const groupSortFieldSchema = z.enum(['name', 'albumCount', 'trackCount']);

const sortDirectionSchema = z.enum(['asc', 'desc']);

export const trackSortFields = trackSortFieldSchema.options;
export const albumSortFields = albumSortFieldSchema.options;
export const groupKinds = groupKindSchema.options;
export const groupSortFields = groupSortFieldSchema.options;
export const sortDirections = sortDirectionSchema.options;

export type TrackSortField = z.infer<typeof trackSortFieldSchema>;
export type AlbumSortField = z.infer<typeof albumSortFieldSchema>;
export type GroupKind = z.infer<typeof groupKindSchema>;
export type GroupSortField = z.infer<typeof groupSortFieldSchema>;
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export interface Sort<F extends string> {
  field: F;
  direction: SortDirection;
}

export type TrackSort = Sort<TrackSortField>;
export type AlbumSort = Sort<AlbumSortField>;
export type GroupSort = Sort<GroupSortField>;

/** What a window of the library is asked for: a sort (undefined is the default order), the library folders to limit it to (none is all of them) and the text to find (none is everything) */
export interface LibraryQuery<S> {
  sort: S | undefined;
  folders: string[];
  /** Matched in the artist, the album and the title, without case and accents */
  search?: string;
}

/** The albums of one artist, album artist or genre: key is the name as the library compares it, empty for the tracks that have none */
export interface AlbumGroup {
  kind: GroupKind;
  key: string;
}

/** The albums of a query, limited to the albums of a group when there is one */
export interface AlbumQuery extends LibraryQuery<AlbumSort> {
  group?: AlbumGroup;
}

/** The artists, album artists or genres of a query, limited to the ones that have the text in their name (no text is all of them) */
export interface GroupQuery extends LibraryQuery<GroupSort> {
  filter: string;
}

const sortSchema = <F extends z.ZodType<string>>(field: F) => z.object({ field, direction: sortDirectionSchema });

export const trackSortSchema = sortSchema(trackSortFieldSchema);
export const albumSortSchema = sortSchema(albumSortFieldSchema);
export const groupSortSchema = sortSchema(groupSortFieldSchema);

const parseWith = <S extends z.ZodType>(schema: S, value: unknown) => schema.safeParse(value).data;

/** A saved or requested track sort, undefined for anything that is not a known field with a known direction */
export const parseTrackSort = (field: unknown, direction: unknown) => parseWith(trackSortSchema, { field, direction });

export const parseAlbumSort = (field: unknown, direction: unknown) => parseWith(albumSortSchema, { field, direction });

export const parseGroupSort = (field: unknown, direction: unknown) => parseWith(groupSortSchema, { field, direction });

export const parseGroupKind = (value: unknown) => parseWith(groupKindSchema, value);

const foldersSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) => [...new Set(items.filter((item) => typeof item === 'string'))]);

/** The folders of a saved or requested selection: the strings in it, once each */
export const parseFolders = (value: unknown): string[] => foldersSchema.parse(value);

/** The sort after a click on a column: ascending, then descending, then back to the default order; another column starts ascending */
export const cycleSort = <F extends string>(current: Sort<F> | undefined, field: F): Sort<F> | undefined => {
  if (current?.field !== field) return { field, direction: 'asc' };

  return current.direction === 'asc' ? { field, direction: 'desc' } : undefined;
};

/** The selected folders that the library still has, a folder that was removed from it is dropped */
export const knownFolders = (selected: string[], known: string[]) => selected.filter((folder) => known.includes(folder));

/** The text of a search, undefined when there is nothing to look for */
export const parseSearch = (value: unknown) => parseWith(z.string().trim().min(1), value);
