import { randomUUID } from 'node:crypto';
import { ipcMain, shell, type IpcMainEvent } from 'electron';
import { z } from 'zod';
import { errorMessage } from '@shared/utils/error-message';
import { sourceServerSchema } from '@shared/schemas/sources';
import type { ListenerContext } from './listener-context';
import { createPlexPin, listPlexServers, plexSignInUrl, waitForPlexToken, type PlexAccountServer } from '../services/sources/plex-account';
import { serveRedirect } from '../services/sources/plex-redirect';
import { SourceError } from '../services/sources/source-request';

const addSchema = z.object({ id: z.string().min(1).max(200) });
// a server of a home network may list many addresses, and each one that does not answer costs the time of its timeout
const maxAddresses = 6;
const plexUser = 'plex';

interface SignIn {
  controller: AbortController;
  servers: PlexAccountServer[];
}

/** Signing in with plex.tv and adding a server of the account: the token stays in the main process, the page gets the names. See docs/app/plex.md */
const registerPlexListeners = ({ sources }: ListenerContext) => {
  let current: SignIn | undefined;

  const reachable = (id: string, name: string, { token, urls }: PlexAccountServer) =>
    urls.slice(0, maxAddresses).reduce<Promise<z.infer<typeof sourceServerSchema> | undefined>>(async (pending, url) => {
      const found = await pending;
      if (found) return found;

      const server = sourceServerSchema.parse({ id, kind: 'plex', name, url, username: plexUser });
      return sources.check(server, token).then(
        () => server,
        () => undefined
      );
    }, Promise.resolve(undefined));

  // the first address that answers with the token is kept, with the token the server accepts as the secret of the entry
  const add = (event: IpcMainEvent, account: PlexAccountServer) =>
    reachable(randomUUID(), account.name, account)
      .then((server) => {
        if (!server) throw new SourceError(0, `${account.name} did not answer on any of its addresses`);
        return sources.save(server, account.token);
      })
      .then(() => sources.list())
      .then((servers) => event.sender.send('SOURCE_SERVERS_LOADED', { servers }))
      .catch((error) => event.sender.send('SOURCE_SERVER_FAILED', { error: errorMessage(error) }));

  const run = async (event: IpcMainEvent, signIn: SignIn) => {
    const { signal } = signIn.controller;
    const clientId = randomUUID();
    event.sender.send('PLEX_ACCOUNT', { status: 'waiting' });

    const pin = await createPlexPin(clientId, signal);
    // not the address of plex.tv itself: the launcher of some systems cuts it at its `&`
    await shell.openExternal(await serveRedirect(plexSignInUrl(clientId, pin.code), signal));
    const token = await waitForPlexToken(pin, clientId, signal);
    signIn.servers = await listPlexServers(token, clientId, signal);

    event.sender.send('PLEX_ACCOUNT', { status: 'servers', servers: signIn.servers.map(({ id, name }) => ({ id, name })) });
    // an account with one server has nothing to choose, and the list stays for the case that it does not answer
    const [only, second] = signIn.servers;
    if (only && !second) add(event, only);
  };

  ipcMain.on('PLEX_SIGN_IN', (event) => {
    current?.controller.abort();
    const signIn: SignIn = { controller: new AbortController(), servers: [] };
    current = signIn;

    run(event, signIn).catch(
      (error) => signIn.controller.signal.aborted || event.sender.send('PLEX_ACCOUNT', { status: 'failed', error: errorMessage(error) })
    );
  });

  ipcMain.on('PLEX_SIGN_IN_CANCEL', () => {
    current?.controller.abort();
    current = undefined;
  });

  ipcMain.on('PLEX_SERVER_ADD', (event, payload: unknown) => {
    const request = addSchema.safeParse(payload);
    const account = current?.servers.find(({ id }) => id === (request.data?.id ?? ''));
    if (!account) return event.sender.send('SOURCE_SERVER_FAILED', { error: 'The server is not known' });

    return add(event, account);
  });
};

export default registerPlexListeners;
