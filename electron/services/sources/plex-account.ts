import { z } from 'zod';

const plexTv = 'https://plex.tv';
const authApp = 'https://app.plex.tv/auth';
const productName = 'Tunelle';
const requestTimeout = 10000;
const pollEvery = 2000;
const giveUpAfter = 5 * 60 * 1000;

const pinSchema = z.object({ id: z.number(), code: z.string().min(1), authToken: z.string().min(1).nullish() });

const connectionSchema = z.object({ uri: z.string(), local: z.boolean().optional(), relay: z.boolean().optional() });
const resourceSchema = z.object({
  name: z.string().min(1),
  clientIdentifier: z.string().min(1),
  provides: z.string().optional().catch(undefined),
  accessToken: z.string().min(1).nullish(),
  connections: z.array(connectionSchema).optional().catch(undefined),
});

/** A server of the account of the user: the token is the one that server accepts, and the addresses are in the order to try them */
export interface PlexAccountServer {
  id: string;
  name: string;
  token: string;
  urls: string[];
}

const headers = (clientId: string, token?: string) => ({
  Accept: 'application/json',
  'X-Plex-Client-Identifier': clientId,
  'X-Plex-Product': productName,
  ...(token ? { 'X-Plex-Token': token } : {}),
});

const plexTvJson = async <Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  init: { method?: string; clientId: string; token?: string; signal?: AbortSignal }
) => {
  const response = await fetch(`${plexTv}${path}`, {
    method: init.method,
    headers: headers(init.clientId, init.token),
    signal: AbortSignal.any([AbortSignal.timeout(requestTimeout), ...(init.signal ? [init.signal] : [])]),
  });
  if (!response.ok) throw new Error(`plex.tv answered ${response.status} to ${init.method ?? 'GET'} ${path.split('?')[0]}`);

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error('plex.tv sent an answer that is not understood');

  return parsed.data;
};

/** Asks plex.tv for a PIN that the user approves in the browser: `strong` makes the code long enough to be used in an address. See docs/app/plex.md */
export const createPlexPin = (clientId: string, signal?: AbortSignal) =>
  plexTvJson('/api/v2/pins?strong=true', pinSchema, { method: 'POST', clientId, signal });

/** The page of plex.tv where the user signs in and approves the PIN: the parameters are in the fragment, as the Plex document describes */
export const plexSignInUrl = (clientId: string, code: string) =>
  `${authApp}#?${new URLSearchParams({ clientID: clientId, code, 'context[device][product]': productName }).toString()}`;

/** Waits until the user approves the PIN, which then carries the token of the account; gives up after five minutes or when `signal` aborts */
export const waitForPlexToken = async (pin: { id: number; code: string }, clientId: string, signal: AbortSignal, since = Date.now()): Promise<string> => {
  signal.throwIfAborted();
  const { authToken } = await plexTvJson(`/api/v2/pins/${pin.id}?${new URLSearchParams({ code: pin.code }).toString()}`, pinSchema, { clientId, signal });
  if (authToken) return authToken;
  if (Date.now() - since > giveUpAfter) throw new Error('The sign in was not approved in time');

  await new Promise((resolve) => setTimeout(resolve, pollEvery));
  return waitForPlexToken(pin, clientId, signal, since);
};

// a local address answers fastest, a relay (the servers of Plex pass the traffic on) only when nothing else does
const rank = ({ local, relay }: z.infer<typeof connectionSchema>) => (relay ? 2 : local ? 0 : 1);

/** The servers of the account, with their addresses in the order to try them (local, then remote, then relay) */
export const listPlexServers = (token: string, clientId: string, signal?: AbortSignal): Promise<PlexAccountServer[]> =>
  plexTvJson('/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1', z.array(resourceSchema), { clientId, token, signal }).then((resources) =>
    resources
      .filter(({ provides }) => provides?.split(',').includes('server'))
      .map(({ name, clientIdentifier, accessToken, connections }) => ({
        id: clientIdentifier,
        name,
        token: accessToken ?? token,
        urls: (connections ?? []).toSorted((a, b) => rank(a) - rank(b)).map(({ uri }) => uri),
      }))
      .filter(({ urls }) => urls.length > 0)
  );
