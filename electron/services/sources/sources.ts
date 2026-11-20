import type { SourceServer } from '@shared/schemas/sources';
import { createSourceStore } from './server-store';
import { createSubsonicClient, type SubsonicClient } from './subsonic-client';

/** The servers of the user and a client for each, which the protocol and the listeners share. See docs/app/sources.md */
export const createSources = (appData: string, userAgent: string) => {
  const store = createSourceStore(appData);
  const clients = new Map<string, SubsonicClient>();

  const clientOf = async (id: string) => {
    const known = clients.get(id);
    if (known) return known;

    const stored = await store.get(id);
    const client = stored && createSubsonicClient(stored.server, stored.password, userAgent);
    if (client) clients.set(id, client);

    return client;
  };

  return {
    list: store.list,
    clientOf,
    /** Asks the server to answer with these credentials, before they are kept; it fails when it does not */
    check: (server: SourceServer, password: string) => createSubsonicClient(server, password, userAgent).ping(),
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
