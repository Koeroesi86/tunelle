import { z } from 'zod';
import type { Database } from 'sqlite3';
import { analysisVersion } from '@shared/constants/loudness';
import { findLoudnessAnalysis } from '../repositories/loudness-repository';
import { findTrackFormat, getAlbumPage, getAlbumTrackList, getGroupCover, getGroupPage, getTrackList, getTrackPage } from '../repositories/library-repository';
import { parseAlbumSort, parseFolders, parseGroupKind, parseGroupSort, parseSearch, parseTrackSort } from '@shared/types/library-query';
import type { AlbumGroup, LibraryQuery } from '@shared/types/library-query';
import { clamp } from '@shared/utils/clamp';

const maxPageSize = 500;

const integer = (fallback: number) => z.string().regex(/^\d+$/).transform(Number).catch(fallback);

const windowSchema = z.object({ offset: integer(0), limit: integer(100).transform((limit) => clamp(limit, 1, maxPageSize)) });

const toWindow = (params: URLSearchParams) => windowSchema.parse({ offset: params.get('offset'), limit: params.get('limit') });

const pathSchema = z.object({ path: z.string() });
const albumKeySchema = z.object({ path: z.string(), title: z.string() });

/** The sort, the folders and the search of a request; a sort that is not a known field with a known direction is no query at all */
const toLibraryQuery = <S>(params: URLSearchParams, parse: (field: unknown, direction: unknown) => S | undefined): LibraryQuery<S> | undefined => {
  const sort = params.get('sort');
  const parsed = sort === null ? undefined : parse(sort, params.get('dir') ?? undefined);

  return sort !== null && !parsed ? undefined : { sort: parsed, folders: parseFolders(params.getAll('folder')), search: parseSearch(params.get('search')) };
};

/** The group the albums are limited to: both parameters or none, a kind that is not known is no query at all */
const toAlbumGroup = (params: URLSearchParams): AlbumGroup | null | undefined => {
  const kind = params.get('by');
  const key = params.get('group');
  if (kind === null && key === null) return undefined;

  const parsed = parseGroupKind(kind);
  return parsed && key !== null ? { kind: parsed, key } : null;
};

type Query = (database: Database, params: URLSearchParams) => Promise<unknown> | undefined;

/** Answers with the result of a query on the library, the library is not served before the database is connected */
const fromLibrary =
  (query: Query) =>
  (database: Database | undefined, params: URLSearchParams): Promise<Response> => {
    if (!database) return Promise.resolve(new Response(undefined, { status: 403 }));

    const result = query(database, params);
    if (!result) return Promise.resolve(new Response(undefined, { status: 400 }));

    return result.then(
      (body) => (body === undefined ? new Response(undefined, { status: 404 }) : Response.json(body)),
      () => new Response(undefined, { status: 500 })
    );
  };

export const libraryRoutes: Record<string, ReturnType<typeof fromLibrary>> = {
  '/library': fromLibrary((database, params) => {
    const query = toLibraryQuery(params, parseTrackSort);
    return query && getTrackList(database, query);
  }),
  // the format and the loudness of one track, which the lists do not carry
  '/library/track': fromLibrary((database, params) => {
    const parsed = pathSchema.safeParse({ path: params.get('path') });
    return parsed.success ? findTrackFormat(database, parsed.data.path) : undefined;
  }),
  // the stored analysis of one track (the histogram of its loudness), 404 for a track that has none
  '/library/loudness': fromLibrary((database, params) => {
    const parsed = pathSchema.safeParse({ path: params.get('path') });
    return parsed.success ? findLoudnessAnalysis(database, parsed.data.path, analysisVersion) : undefined;
  }),
  '/library/tracks': fromLibrary((database, params) => {
    const { offset, limit } = toWindow(params);
    const query = toLibraryQuery(params, parseTrackSort);
    return query && getTrackPage(database, offset, limit, query);
  }),
  '/library/albums': fromLibrary((database, params) => {
    const { offset, limit } = toWindow(params);
    const query = toLibraryQuery(params, parseAlbumSort);
    const group = toAlbumGroup(params);
    return query && group !== null ? getAlbumPage(database, offset, limit, { ...query, group }) : undefined;
  }),
  '/library/groups': fromLibrary((database, params) => {
    const { offset, limit } = toWindow(params);
    const query = toLibraryQuery(params, parseGroupSort);
    const kind = parseGroupKind(params.get('by'));
    return query && kind ? getGroupPage(database, kind, offset, limit, { ...query, filter: params.get('q') ?? '' }) : undefined;
  }),
  // the photo or cover that the tile of one group shows, for the header of the open group
  '/library/group-cover': fromLibrary((database, params) => {
    const kind = parseGroupKind(params.get('by'));
    const key = params.get('key');
    return kind && key ? getGroupCover(database, kind, key) : undefined;
  }),
  '/library/album': fromLibrary((database, params) => {
    const parsed = albumKeySchema.safeParse({ path: params.get('path'), title: params.get('title') });
    return parsed.success ? getAlbumTrackList(database, parsed.data.path, parsed.data.title) : undefined;
  }),
};
