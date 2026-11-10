import path from 'path';
import type { Database } from 'sqlite3';
import type { AlbumSummary, Folder, GroupSummary, LibraryPage, Query, Track } from '@shared/types/library';
import type {
  AlbumGroup,
  AlbumQuery,
  AlbumSortField,
  GroupKind,
  GroupQuery,
  GroupSortField,
  LibraryQuery,
  SortDirection,
  TrackSort,
  TrackSortField,
} from '@shared/types/library-query';
import { z } from 'zod';
import executeQuery from '../database/execute-query';
import { albumSummarySchema, groupSummarySchema, trackSchema } from '@shared/schemas/library';
import { libraryRowSchema } from '../schemas/database/library';
import { folderRowSchema } from '../schemas/rows';
import executeQueries from '../database/execute-queries';
import { toSortKey } from '../database/sort-key';
import { getAlbumArtAccents } from '../library/art/album-art-accents';

// ! is the escape character of the LIKE below, so % and _ in a folder name match themselves
const escapeLike = (value: string) => value.replace(/[!%_]/g, '!$&');

/** The columns of a track that a list shows. The loudness is not among them: a lookup for each of thousands of rows is cost for nothing, the player asks for the one track (`findTrackFormat`) */
const trackColumns = [
  'path',
  'artist',
  'album',
  'title',
  'year',
  'track',
  'disk',
  'genre',
  'picture',
  'duration',
  'albumArtist',
  'codec',
  'bitDepth',
  'sampleRate',
  'bitrate',
  'vbr',
  'lossless',
] as const satisfies readonly (keyof Track)[];

// a list shows the tags and the format of a track, not the loudness and the size of its file; NULL text is taken as empty
const trackListSchema = trackSchema.omit({ fileModified: true, fileSize: true, trackGain: true, albumGain: true, trackPeak: true, albumPeak: true });

const formatRowSchema = libraryRowSchema.pick({
  codec: true,
  bitDepth: true,
  sampleRate: true,
  bitrate: true,
  vbr: true,
  lossless: true,
  trackGain: true,
  albumGain: true,
  trackPeak: true,
  albumPeak: true,
});

const groupRowSchema = groupSummarySchema.omit({ accent: true, covers: true }).extend({ covers: z.string().nullable() });

const albumRowSchema = albumSummarySchema.omit({ id: true, path: true, accent: true }).extend({ firstPath: z.string() });

const loudnessColumns = ['trackGain', 'albumGain', 'trackPeak', 'albumPeak'];

const isLoudnessColumn = (column: string) => loudnessColumns.includes(column);

/** A loudness column of a track: its tags first, else what was measured, while the measurement is of the file as it is. See docs/app/loudness-measurement.md */
const effectiveLoudness = (column: string) =>
  `COALESCE(library.${column}, (SELECT track_loudness.${column} FROM track_loudness WHERE track_loudness.path = library.path AND track_loudness.fileModified = library.fileModified AND track_loudness.fileSize = library.fileSize)) AS ${column}`;

/** The columns of a query as a list; the names come from the keys of a type, never from the incoming text */
const columnList = (columns: readonly string[]) => columns.map((column) => (isLoudnessColumn(column) ? effectiveLoudness(column) : column)).join(', ');

/** The folders in the order of their paths */
export const getFolders = (database: Database) =>
  executeQuery(database, { query: `SELECT path, lastModified FROM folders ORDER BY path ASC`, variables: [] }, folderRowSchema);

/** The folders below a folder, the folder itself is not among them */
export const getFoldersInside = (database: Database, folderPath: string) =>
  executeQuery(
    database,
    { query: `SELECT path FROM folders WHERE path LIKE ? ESCAPE '!'`, variables: [`${escapeLike(folderPath.replace(/[\\/]+$/, '') + path.sep)}%`] },
    folderRowSchema.pick({ path: true })
  );

export const saveFolders = (database: Database, folders: Folder[]) =>
  executeQueries(
    database,
    folders.map((folder) => ({
      query: `INSERT INTO folders (path, lastModified) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET lastModified = excluded.lastModified`,
      variables: [folder.path, folder.lastModified],
    }))
  );

export const deleteFolders = (database: Database, folders: Pick<Folder, 'path'>[]) =>
  executeQueries(
    database,
    folders.map((folder) => ({ query: `DELETE FROM folders WHERE path = ?`, variables: [folder.path] }))
  );

/** Remove the tracks below a folder from the library, the files stay on disk */
/** The format and the loudness of a track as the player takes them (the tags first, else what was measured), undefined for a track the library does not have */
export const findTrackFormat = (database: Database, trackPath: string) =>
  executeQuery(
    database,
    {
      query: `SELECT codec, bitDepth, sampleRate, bitrate, vbr, lossless, ${columnList(loudnessColumns)} FROM library WHERE path = ?`,
      variables: [trackPath],
    },
    formatRowSchema
  ).then(([format]): z.output<typeof formatRowSchema> | undefined => format);

// the scan stores the paths of tracks with forward slashes (scan-folder.ts), the folder keeps the ones it was picked with
const insidePatterns = (folderPath: string) => {
  const trimmed = folderPath.replace(/[\\/]+$/, '');

  return [...new Set([`${trimmed.replace(/\\/g, '/')}/`, `${trimmed}${path.sep}`])].map((prefix) => `${escapeLike(prefix)}%`);
};

const insideCondition = (patterns: string[]) => patterns.map(() => `path LIKE ? ESCAPE '!'`).join(' OR ');

export const deleteTracksInside = (database: Database, folderPath: string) =>
  executeQueries(database, [
    { query: `DELETE FROM track_loudness WHERE ${insideCondition(insidePatterns(folderPath))}`, variables: insidePatterns(folderPath) },
    { query: `DELETE FROM library WHERE ${insideCondition(insidePatterns(folderPath))}`, variables: insidePatterns(folderPath) },
  ]);

/** The tracks below a folder, with the path and the stat of the file they were read from */
export const getTracksInside = (database: Database, folderPath: string) =>
  executeQuery(
    database,
    { query: `SELECT path, fileModified, fileSize FROM library WHERE ${insideCondition(insidePatterns(folderPath))}`, variables: insidePatterns(folderPath) },
    libraryRowSchema.pick({ path: true, fileModified: true, fileSize: true })
  );

/** Whether the library has a track below a folder */
export const hasTracksInside = (database: Database, folderPath: string) =>
  executeQuery(
    database,
    { query: `SELECT 1 AS found FROM library WHERE ${insideCondition(insidePatterns(folderPath))} LIMIT 1`, variables: insidePatterns(folderPath) },
    z.object({ found: z.number() })
  ).then((rows) => rows.length > 0);

// the folder of a track including the trailing separator, for both separators: rtrim drops the characters after the last one
export const folderOfColumn = (column: string) => `rtrim(${column}, replace(replace(${column}, '/', ''), '\\', ''))`;
const folderOf = folderOfColumn('path');

const countTotal = (database: Database, query: string, variables: unknown[]) =>
  executeQuery(database, { query, variables }, z.object({ total: z.number() })).then(([row]) => row.total);

/** How a field is ordered: when its value is empty (empty values come last in both directions) and the value itself */
interface FieldOrder {
  empty: string;
  value: string;
}

/** A text is sorted by its key column (no case, no accents), a text without a key (not filled yet) is empty */
const textOrder = (key: string): FieldOrder => ({ empty: `COALESCE(${key}, '') = ''`, value: key });

/** The numbers are stored as text (`3`, `3/12`, `2001-05-03`), the leading number is taken; 0 and no number at all are empty */
const numberOrder = (expression: string): FieldOrder => ({
  empty: `NULLIF(CAST(${expression} AS REAL), 0) IS NULL`,
  value: `NULLIF(CAST(${expression} AS REAL), 0)`,
});

const trackOrders: Record<TrackSortField, FieldOrder> = {
  title: textOrder('title_key'),
  artist: textOrder('artist_key'),
  album: textOrder('album_key'),
  year: numberOrder('year'),
  duration: numberOrder('duration'),
  track: numberOrder('track'),
};

// the artist and the year are the bare columns of the row of MIN(path), the first track of the album
const albumOrders: Record<AlbumSortField, FieldOrder> = {
  title: textOrder('album_key'),
  artist: textOrder('artist_key'),
  year: numberOrder('year'),
  // never empty; not a bare 0, which ORDER BY takes for the position of a column
  trackCount: { empty: '(1 = 0)', value: 'COUNT(*)' },
  duration: numberOrder('SUM(duration)'),
};

const directions: Record<SortDirection, string> = { asc: 'ASC', desc: 'DESC' };

/**
 * The ORDER BY of a sort, built from the whitelists above and never from the incoming text: an unknown field or direction gives the default order.
 * Ties keep the default order (`tieBreaker`), also in the descending direction, so equal rows do not move
 */
const toOrderBy = <F extends string>(orders: Record<F, FieldOrder>, sort: { field: F; direction: SortDirection } | undefined, tieBreaker: string) => {
  const order = sort && Object.hasOwn(orders, sort.field) ? orders[sort.field] : undefined;
  const direction = sort ? directions[sort.direction] : undefined;

  return order && direction ? `${order.empty} ASC, ${order.value} ${direction}, ${tieBreaker} ASC` : `${tieBreaker} ASC`;
};

/** The library folders as a bound condition on a path; no folder is no condition, the tracks of every folder */
const toFolderCondition = (folders: string[]) => {
  const prefixes = folders.flatMap((folder) => ['/', '\\'].map((separator) => `${escapeLike(folder.replace(/[\\/]+$/, '') + separator)}%`));

  return {
    condition: prefixes.length ? `(${prefixes.map(() => `path LIKE ? ESCAPE '!'`).join(' OR ')})` : '',
    variables: prefixes,
  };
};

/** A search as a bound condition on the sort keys of the artist, the album and the title, which hold the text without case and accents */
const toSearchCondition = (search: string | undefined) => {
  const key = toSortKey(search);
  const pattern = `%${escapeLike(key)}%`;
  const condition = `(title_key LIKE ? ESCAPE '!' OR artist_key LIKE ? ESCAPE '!' OR album_key LIKE ? ESCAPE '!')`;

  return { condition: key ? condition : '', variables: key ? [pattern, pattern, pattern] : [] };
};

/** The WHERE for the tracks that are in the folders and match the search */
const toTrackFilter = ({ folders, search }: Pick<LibraryQuery<unknown>, 'folders' | 'search'>) => {
  const conditions = [toFolderCondition(folders), toSearchCondition(search)].filter(({ condition }) => condition);

  return {
    where: conditions.length ? `WHERE ${conditions.map(({ condition }) => condition).join(' AND ')}` : '',
    variables: conditions.flatMap(({ variables }) => variables),
  };
};

/** The tracks in the order of the sort, in the default order (by path) when there is none, limited to the tracks below the folders when there are any; with the columns asked for */
const toLibraryQuery = (query: LibraryQuery<TrackSort>, columns: readonly string[]): Query => {
  const filter = toTrackFilter(query);

  return {
    query: `SELECT ${columnList(columns)} FROM library ${filter.where} ORDER BY ${toOrderBy(trackOrders, query.sort, 'path')}`,
    variables: filter.variables,
  };
};

/** The path and the codec of the tracks of a query, for the work inside the main process that does not need a whole track */
export const getLibrary = (database: Database, query: LibraryQuery<TrackSort>) =>
  executeQuery(database, toLibraryQuery(query, ['path', 'codec']), libraryRowSchema.pick({ path: true, codec: true }));

/** The whole library as the lists show it, every row read by the schema of the list (about 2.6 ms for 1000 rows) */
export const getTrackList = (database: Database, query: LibraryQuery<TrackSort>) =>
  executeQuery(database, toLibraryQuery(query, trackColumns), trackListSchema);

/** A page of the tracks in the order of getLibrary, with the number of tracks it has */
export const getTrackPage = (database: Database, offset: number, limit: number, query: LibraryQuery<TrackSort>): Promise<LibraryPage<Track>> => {
  const filter = toTrackFilter(query);

  return Promise.all([
    executeQuery(
      database,
      {
        query: `SELECT ${columnList(trackColumns)} FROM library ${filter.where} ORDER BY ${toOrderBy(trackOrders, query.sort, 'path')} LIMIT ? OFFSET ?`,
        variables: [...filter.variables, limit, offset],
      },
      trackListSchema
    ),
    countTotal(database, `SELECT COUNT(*) AS total FROM library ${filter.where}`, filter.variables),
  ]).then(([items, total]) => ({ items, total }));
};

const withPhoto = (key: string) => `COALESCE((SELECT picture FROM artist_photos WHERE artist_photos.key = ${key}), MAX(picture))`;

// the column the tracks of an artist, an album artist or a genre share, and the one that holds the name as it is written; the keys have an index
// and the cover: the photo of the name when it has one (the artists and the album artists), else the cover of one of its albums; a genre has none
// but up to three covers of its albums (separated by a unit separator, as a path may hold any other character), which the card of a genre fans out
const coverSeparator = String.fromCharCode(31);
const groupColumns: Record<GroupKind, { key: string; name: string; cover: (key: string) => string; covers: (key: string) => string }> = {
  artist: { key: 'artist_key', name: 'artist', cover: withPhoto, covers: () => 'NULL' },
  albumArtist: { key: 'album_artist_key', name: 'albumArtist', cover: withPhoto, covers: () => 'NULL' },
  genre: {
    key: 'genre_key',
    name: 'genre',
    cover: () => 'NULL',
    covers: (key) =>
      `(SELECT group_concat(picture, char(31)) FROM (SELECT DISTINCT picture FROM scoped AS sample WHERE sample.${key} = scoped.${key} AND COALESCE(picture, '') != '' ORDER BY picture LIMIT 3))`,
  },
};

// a folder and an album title make one album
const albumIdentity = `folder || char(0) || COALESCE(album, '')`;

const groupOrders = (key: string): Record<GroupSortField, FieldOrder> => ({
  name: textOrder(key),
  albumCount: { empty: '(1 = 0)', value: `COUNT(DISTINCT ${albumIdentity})` },
  trackCount: { empty: '(1 = 0)', value: 'COUNT(*)' },
});

/**
 * A page of the artists, the album artists or the genres: the tracks with the same name make one, the ones without a name make the last.
 * The default order and the order of equal values is by name. Limited to the tracks below the folders when there are any and to the names with the text of the query in them
 */
export const getGroupPage = (
  database: Database,
  kind: GroupKind,
  offset: number,
  limit: number,
  { sort, folders, filter }: GroupQuery
): Promise<LibraryPage<GroupSummary>> => {
  const { key, name, cover, covers } = groupColumns[kind];
  const folderFilter = toTrackFilter({ folders });
  const scoped = `WITH scoped AS (SELECT ${columnList(['path', 'album', 'picture', 'artist_key', 'album_artist_key', 'genre_key', name])}, ${folderOf} AS folder FROM library ${folderFilter.where})`;
  const source = `FROM scoped WHERE ${key} LIKE ? ESCAPE '!'`;
  const variables = [...folderFilter.variables, `%${escapeLike(toSortKey(filter))}%`];

  return Promise.all([
    executeQuery(
      database,
      {
        query: `${scoped} SELECT ${key} AS "key", MIN(TRIM(COALESCE(${name}, ''))) AS name, COUNT(DISTINCT ${albumIdentity}) AS albumCount, COUNT(*) AS trackCount, ${cover(key)} AS cover, ${covers(key)} AS covers
        ${source} GROUP BY ${key} ORDER BY ${toOrderBy(groupOrders(key), sort, `(${key} = '') ASC, ${key}`)} LIMIT ? OFFSET ?`,
        variables: [...variables, limit, offset],
      },
      groupRowSchema
    ),
    countTotal(database, `${scoped} SELECT COUNT(*) AS total FROM (SELECT 1 ${source} GROUP BY ${key})`, variables),
  ]).then(async ([items, total]) => {
    const accents = await getAlbumArtAccents(
      database,
      items.map((group) => group.cover)
    );

    return {
      items: items.map(({ covers: joined, ...group }) => ({
        ...group,
        accent: group.cover ? accents.get(group.cover) : undefined,
        covers: joined ? joined.split(coverSeparator) : [],
      })),
      total,
    };
  });
};

/** The condition that limits the tracks to the ones of a group, none when the albums are not of a group */
// what the albums read: the columns they show, the keys they are filtered and ordered by, and the path for the folder
const albumSourceColumns = columnList([
  'path',
  'album',
  'artist',
  'picture',
  'year',
  'duration',
  'codec',
  'bitDepth',
  'sampleRate',
  'bitrate',
  'vbr',
  'lossless',
  'title_key',
  'artist_key',
  'album_key',
  'album_artist_key',
  'genre_key',
]);

// what counting the albums reads: the path for the folder, the album title and the keys of the filters
const albumCountColumns = columnList(['path', 'album', 'title_key', 'artist_key', 'album_key', 'album_artist_key', 'genre_key']);

const toGroupFilter = (group: AlbumGroup | undefined) => ({
  where: group ? `WHERE ${groupColumns[group.kind].key} = ?` : '',
  variables: group ? [group.key] : [],
});

/**
 * A page of the albums, a folder and an album title make one album, with the number of albums
 * See docs/app/library-queries.md
 */
export const getAlbumPage = (
  database: Database,
  offset: number,
  limit: number,
  { sort, folders, search, group }: AlbumQuery
): Promise<LibraryPage<AlbumSummary>> => {
  const folder = toFolderCondition(folders);
  const match = toSearchCondition(search);
  const groupFilter = toGroupFilter(group);
  const where = folder.condition ? `WHERE ${folder.condition}` : '';
  const having = match.condition ? `HAVING MAX(${match.condition}) = 1` : '';
  const variables = [...folder.variables, ...groupFilter.variables, ...match.variables];

  return Promise.all([
    executeQuery(
      database,
      {
        // the bare columns come from the row of MIN(path), the first track of the album
        query: `SELECT COALESCE(album, '') AS title, artist, picture AS cover, year, SUM(duration) AS duration, COUNT(*) AS trackCount, codec, bitDepth, sampleRate, bitrate, vbr, lossless, MIN(path) AS firstPath
        FROM (SELECT ${albumSourceColumns}, ${folderOf} AS folder FROM library ${where}) ${groupFilter.where} GROUP BY folder, COALESCE(album, '') ${having}
        ORDER BY ${toOrderBy(albumOrders, sort, 'MIN(path)')} LIMIT ? OFFSET ?`,
        variables: [...variables, limit, offset],
      },
      albumRowSchema
    ),
    countTotal(
      database,
      `SELECT COUNT(*) AS total FROM (SELECT 1 FROM (SELECT ${albumCountColumns}, ${folderOf} AS folder FROM library ${where}) ${groupFilter.where} GROUP BY folder, COALESCE(album, '') ${having})`,
      variables
    ),
  ]).then(async ([albums, total]) => {
    const accents = await getAlbumArtAccents(
      database,
      albums.map((album) => album.cover)
    );

    return {
      items: albums.map(({ firstPath, ...album }) => ({
        ...album,
        accent: album.cover ? accents.get(album.cover) : undefined,
        path: path.dirname(firstPath),
        id: `${path.dirname(firstPath)} - ${album.title}`,
      })),
      total,
    };
  });
};

/** The tracks of an album, folder is the directory of the album */
const toAlbumTracksQuery = (folder: string, album: string, columns: readonly string[]): Query => ({
  query: `SELECT ${columnList(columns)} FROM library WHERE ${folderOf} IN (?, ?, ?) AND COALESCE(album, '') = ? ORDER BY path ASC`,
  variables: [folder, `${folder}/`, `${folder}\\`, album],
});

/** The paths of the tracks of an album, for the work inside the main process that does not need a whole track */
export const getAlbumTracks = (database: Database, folder: string, album: string) =>
  executeQuery(database, toAlbumTracksQuery(folder, album, ['path']), libraryRowSchema.pick({ path: true }));

/** The tracks of an album as the lists show them, every row read by the schema of the list */
export const getAlbumTrackList = (database: Database, folder: string, album: string) =>
  executeQuery(database, toAlbumTracksQuery(folder, album, trackColumns), trackListSchema);

export const findTrackPath = (database: Database, trackPath: string) =>
  executeQuery(database, { query: `SELECT path FROM library WHERE path = ?`, variables: [trackPath] }, libraryRowSchema.pick({ path: true })).then(
    ([track]) => track?.path
  );

/** What the `/track` route needs to serve a file of the library: the codec says whether it has to be decoded first */
export const findPlayableTrack = (database: Database, trackPath: string) =>
  executeQuery(
    database,
    { query: `SELECT path, codec, bitDepth FROM library WHERE path = ?`, variables: [trackPath] },
    libraryRowSchema.pick({ path: true, codec: true, bitDepth: true })
  ).then(([track]) => track);

export const deleteTracks = (database: Database, tracks: Pick<Track, 'path'>[]) =>
  executeQueries(
    database,
    tracks.flatMap((track) => [
      { query: `DELETE FROM track_loudness WHERE path = ?`, variables: [track.path] },
      { query: `DELETE FROM library WHERE path = ?`, variables: [track.path] },
    ])
  );
