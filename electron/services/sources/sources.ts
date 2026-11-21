import type { LibraryKind, LibrarySort, SourcePage, SourceServer } from '@shared/schemas/sources';
import { createSourceStore } from './server-store';
import { createJellyfinClient } from './jellyfin-client';
import { createPlexClient } from './plex-client';
import { createSubsonicClient } from './subsonic-client';

const clientFactories = { subsonic: createSubsonicClient, jellyfin: createJellyfinClient, plex: createPlexClient };

const createClient = (server: SourceServer, password: string, userAgent: string) => clientFactories[server.kind](server, password, userAgent);

/** A page of everything a server has of a kind, in an order. A client that has it lists in `sourceCapabilities` of its kind which sections and orders it answers */
export type SourceLibrary = (kind: LibraryKind, sort: LibrarySort, start: number, size: number) => Promise<SourcePage>;

/** The calls of one server, whatever its kind: every client answers the same, and one that has a library lists it in pages besides */
export type SourceClient = ReturnType<typeof createClient> & { library?: SourceLibrary };

/** The servers of the user and a client for each, which the protocol and the listeners share. See docs/app/sources.md */
export const createSources = (appData: string, userAgent: string) => {
  const store = createSourceStore(appData);
  const clients = new Map<string, SourceClient>();

  const clientOf = async (id: string) => {
    const known = clients.get(id);
    if (known) return known;

    const stored = await store.get(id);
    const client = stored && createClient(stored.server, stored.password, userAgent);
    if (client) clients.set(id, client);

    return client;
  };

  return {
    list: store.list,
    clientOf,
    /** Asks the server to answer with these credentials, before they are kept; it fails when it does not */
    check: (server: SourceServer, password: string) => createClient(server, password, userAgent).ping(),
    /** Adds the server or replaces the one with its id; a client that was made with the old address, user or password is dropped */
    save: async (server: SourceServer, password: string) => {
      clients.delete(server.id);
      return store.save(server, password);
    },
    remove: async (id: string) => {
      clients.delete(id);
      return store.remove(id);
    },
  };
};
export type Sources = ReturnType<typeof createSources>;
