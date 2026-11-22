import type { DiscoveredServer, PlexAccount, SourceServerInfo } from '@shared/schemas/sources';

/** The failures of the browses by their request */
export type SourceBrowsed = Record<string, { error?: string }>;

/** What the page of the servers shows of the servers of the sources */
export interface SourceServersState {
  servers: SourceServerInfo[];
  /** A server is being checked and kept */
  saving: boolean;
  failure?: { id?: string; error: string; code?: number };
  /** The certificate of a server that the user is asked to approve */
  certificate?: { url: string; certificate: string; code: string };
  /** The Jellyfin servers that answered on the network: `searching` until they did */
  discovery?: { searching: boolean; servers: DiscoveredServer[]; error?: string };
  /** The sign in with plex.tv: the user approves it in the browser, then the servers of the account are there to add */
  plexAccount?: PlexAccount;
}
