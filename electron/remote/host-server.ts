import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import { z } from 'zod';
import type { AccessControl } from './access';
import type { HostIdentity } from './certificate';

const MAX_BODY_BYTES = 4096;

const nowPlayingSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({
    state: z.enum(['playing', 'paused']),
    title: z.string(),
    artist: z.string().optional(),
    album: z.string().optional(),
    /** The position in seconds at `at` (milliseconds since the epoch), which the listener runs on from */
    position: z.number().nonnegative(),
    at: z.number(),
    duration: z.number().nonnegative().optional(),
  }),
]);
export type NowPlaying = z.infer<typeof nowPlayingSchema>;

export interface HostServer {
  port: number;
  /** What the approved listeners are shown; the renderer sends a new one when the track, the play state or the position jumps */
  setNowPlaying: (snapshot: NowPlaying) => void;
  close: () => Promise<void>;
}

export interface HostOptions {
  identity: HostIdentity;
  access: AccessControl;
  /** 0 picks a free port */
  port?: number;
  /** Only this machine, which is not advertised and asks for no firewall prompt */
  loopbackOnly?: boolean;
}

const requestStatus = { pending: 202, approved: 200, invalid: 400, blocked: 403, 'rate-limited': 429, full: 503 } as const;

const send = (response: ServerResponse, status: number, body: unknown = {}) => {
  if (response.headersSent) return response.end();
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};

/** The body as JSON, or undefined when it is too long, cut or not JSON: nothing here throws */
const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) return undefined;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
};

const credentials = (request: IncomingMessage) => ({
  deviceId: `${request.headers['x-tunelle-device'] ?? ''}`,
  secret: `${request.headers.authorization ?? ''}`.replace(/^Bearer /, ''),
});

/** The HTTPS server of the host: a request to listen, and the now playing of an approved device. No other route exists. See docs/app/remote-access-discovery.md */
export const startHostServer = async ({ identity, access, port = 0, loopbackOnly = false }: HostOptions): Promise<HostServer> => {
  let nowPlaying: NowPlaying = { state: 'idle' };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'https://host').pathname;
    if (request.method === 'POST' && path === '/remote/request') {
      const result = access.request(request.socket.remoteAddress ?? '', await readJson(request));
      return send(response, requestStatus[result.status], result);
    }
    if (request.method === 'GET' && path === '/remote/now-playing') {
      const { deviceId, secret } = credentials(request);
      return access.authenticate(deviceId, secret) ? send(response, 200, nowPlaying) : send(response, 401, { status: 'unauthorized' });
    }
    return send(response, 404, { status: 'not-found' });
  };

  const server: Server = createServer({ cert: identity.certificate, key: identity.key }, (request, response) => {
    handle(request, response).catch(() => send(response, 500, { status: 'error' }));
  });
  // a socket that fails ends there: an unhandled error would open the error dialog of the app
  server.on('tlsClientError', () => undefined);
  server.on('clientError', (_error, socket) => socket.destroy());

  server.listen(port, loopbackOnly ? '127.0.0.1' : '0.0.0.0');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('The host server has no port');

  return {
    port: address.port,
    setNowPlaying: (snapshot) => {
      nowPlaying = nowPlayingSchema.parse(snapshot);
    },
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
};
