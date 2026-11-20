import { z } from 'zod';

// the online sources that have servers of the user (docs/app/sources.md)

const sourceKindSchema = z.enum(['subsonic']);

const serverIdSchema = z.uuid();

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

/** A server as the page shows it: `protected` is false when the password is kept in plain text, as the system has no keyring to encrypt it with */
export type SourceServerInfo = SourceServer & { protected: boolean };

/** What the page asks of a server to show: the artists, the albums of an artist, the tracks of an album, or a search */
export const sourceBrowseSchema = z.discriminatedUnion('what', [
  z.object({ what: z.literal('artists'), serverId: serverIdSchema }),
  z.object({ what: z.literal('albums'), serverId: serverIdSchema, id: z.string().min(1).max(512) }),
  z.object({ what: z.literal('tracks'), serverId: serverIdSchema, id: z.string().min(1).max(512) }),
  z.object({ what: z.literal('search'), serverId: serverIdSchema, query: z.string().trim().min(1).max(200) }),
]);
export type SourceBrowse = z.infer<typeof sourceBrowseSchema>;

export interface SourceArtist {
  id: string;
  name: string;
  albumCount: number;
}

export interface SourceAlbum {
  id: string;
  title: string;
  artist: string;
  year: string;
  songCount: number;
  /** The id of the cover, which the server names; it is asked for through the protocol and never as an address of the server */
  coverArt: string | undefined;
}
