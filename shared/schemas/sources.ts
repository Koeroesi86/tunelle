import { z } from 'zod';
import { trackSchema } from './library';

// the online sources that have servers of the user (docs/app/sources.md)

const sourceKindSchema = z.enum(['subsonic', 'jellyfin', 'plex']);
export type SourceKind = z.infer<typeof sourceKindSchema>;

const serverIdSchema = z.uuid();

const libraryKindSchema = z.enum(['albums', 'artists', 'tracks']);
const librarySortSchema = z.enum(['title', 'recent']);
export type LibraryKind = z.infer<typeof libraryKindSchema>;
export type LibrarySort = z.infer<typeof librarySortSchema>;

/** The parts of the local navigation a kind of server can show beside its drill down: only the sections and orders it lists are offered, an empty one has no library. See docs/app/sources.md */
export interface SourceCapabilities {
  library?: { sections: readonly LibraryKind[]; sorts: readonly LibrarySort[] };
}

export const sourceCapabilities: Record<SourceKind, SourceCapabilities> = {
  // Subsonic has no call that lists all songs, and lists its artists by name only
  subsonic: { library: { sections: ['albums', 'artists'], sorts: ['recent', 'title'] } },
  jellyfin: { library: { sections: ['albums', 'artists', 'tracks'], sorts: ['recent', 'title'] } },
  plex: { library: { sections: ['albums', 'artists', 'tracks'], sorts: ['recent', 'title'] } },
};

/** What a track of a server is called: `<source>:<serverId>:<id>`, the id is whatever the server calls the song and may hold a colon */
export const sourcePathSchema = z
  .string()
  .regex(/^[a-z]+:[^:]+:.+$/)
  .transform((path) => {
    const [source, serverId, ...id] = path.split(':');
    return { source, serverId, id: id.join(':') };
  })
  .pipe(z.object({ source: sourceKindSchema, serverId: serverIdSchema, id: z.string().max(512) }));
export type SourceRef = z.infer<typeof sourcePathSchema>;

export const toSourcePath = ({ source, serverId, id }: SourceRef) => `${source}:${serverId}:${id}`;

const httpUrl = z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/+$/, ''));

/** A server that answered on the network: the user chooses it and gives the login, nothing of it is kept */
export const discoveredServerSchema = z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(100), url: httpUrl });
export type DiscoveredServer = z.infer<typeof discoveredServerSchema>;

/** A server as the user entered it, without the password */
export const sourceServerSchema = z.object({
  id: serverIdSchema,
  kind: sourceKindSchema,
  name: z.string().trim().min(1).max(100),
  url: httpUrl,
  username: z.string().min(1).max(200),
  /** The certificate (PEM) that the user approved for this server, every call is pinned to it. Without one the certificate must be valid */
  certificate: z.string().min(1).optional(),
});
export type SourceServer = z.infer<typeof sourceServerSchema>;

/** What the page sends to add or change a server: the password is sent once and never comes back */
export const sourceServerInputSchema = sourceServerSchema.extend({ password: z.string().min(1).max(500) });

/** What the page asks of a server to show: the artists, the albums of an artist, the tracks of an album, or a search */
export const sourceBrowseSchema = z.discriminatedUnion('what', [
  z.object({ what: z.literal('artists'), serverId: serverIdSchema }),
  z.object({ what: z.literal('albums'), serverId: serverIdSchema, id: z.string().min(1).max(512) }),
  z.object({ what: z.literal('tracks'), serverId: serverIdSchema, id: z.string().min(1).max(512) }),
  z.object({ what: z.literal('search'), serverId: serverIdSchema, query: z.string().trim().min(1).max(200) }),
  /** A page of everything a server has of a kind, in an order: the albums, the artists or the songs of a library */
  z.object({
    what: z.literal('library'),
    serverId: serverIdSchema,
    kind: libraryKindSchema,
    sort: librarySortSchema,
    start: z.number().int().min(0).max(1_000_000),
    size: z.number().int().min(1).max(200),
  }),
]);
export type SourceBrowse = z.infer<typeof sourceBrowseSchema>;

const sourceArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  albumCount: z.number().optional(),
  /** The id of the photo, which the server names */
  coverArt: z.string().optional(),
});
export type SourceArtist = z.infer<typeof sourceArtistSchema>;

const sourceAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  year: z.string(),
  /** Not every server tells it in a list: Plex does not */
  songCount: z.number().optional(),
  /** The id of the cover, which the server names; it is asked for through the protocol and never as an address of the server */
  coverArt: z.string().optional(),
});
export type SourceAlbum = z.infer<typeof sourceAlbumSchema>;

const sourceSearchResultSchema = z.object({
  artists: z.array(sourceArtistSchema),
  albums: z.array(sourceAlbumSchema),
  tracks: z.array(trackSchema),
});
export type SourceSearchResult = z.infer<typeof sourceSearchResultSchema>;

export const sourceServerInfoSchema = sourceServerSchema.extend({ protected: z.boolean() });

/** What the main process answers to a browse: the list of the request, which the request tells the kind of; a server that does not count its items tells no total */
const sourcePageSchema = z.object({
  total: z.number().int().optional(),
  items: z.union([z.array(sourceArtistSchema), z.array(sourceAlbumSchema), z.array(trackSchema)]),
});
export type SourcePage = z.infer<typeof sourcePageSchema>;

const sourceBrowseResultSchema = z.union([
  z.array(sourceArtistSchema),
  z.array(sourceAlbumSchema),
  z.array(trackSchema),
  sourceSearchResultSchema,
  sourcePageSchema,
]);
export type SourceBrowseResult = z.infer<typeof sourceBrowseResultSchema>;

export const sourceBrowsedSchema = z.object({ request: sourceBrowseSchema, result: sourceBrowseResultSchema.optional(), error: z.string().optional() });
export const sourceDiscoveredSchema = z.object({ servers: z.array(discoveredServerSchema), error: z.string().optional() });
/** Where the sign in with plex.tv is: waiting for the user to approve it in the browser, the servers of the account (the names only), or failed */
export const plexAccountSchema = z.object({
  status: z.enum(['waiting', 'servers', 'failed']),
  servers: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  error: z.string().optional(),
});
export type PlexAccount = z.infer<typeof plexAccountSchema>;
export const sourceServerFailedSchema = z.object({ id: z.string().optional(), error: z.string(), code: z.number().optional() });
export const sourceCertificateReadSchema = z.object({ url: z.string(), certificate: z.string(), code: z.string() });

/** A server as the page shows it: `protected` is false when the password is kept in plain text, as the system has no keyring to encrypt it with */
export type SourceServerInfo = z.infer<typeof sourceServerInfoSchema>;
