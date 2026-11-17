import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccessControl } from './access';
import { nowPlayingSchema, type NowPlaying } from './now-playing';

const MAX_BODY_BYTES = 4096;

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

/** The two routes of the host and the now playing they answer with; no other route exists. See docs/app/remote-access-discovery.md */
export const createRoutes = (access: AccessControl) => {
  let nowPlaying: NowPlaying = { state: 'idle' };

  const route = async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'https://host').pathname;
    if (request.method === 'POST' && path === '/remote/request') {
      const result = access.request(request.socket.remoteAddress ?? '', await readJson(request));
      return send(response, requestStatus[result.status], result);
    }
    if (request.method === 'GET' && path === '/remote/now-playing') {
      const { deviceId, secret } = credentials(request);
      const result = access.authorize(request.socket.remoteAddress ?? '', deviceId, secret);
      if (result.status === 'ok') return send(response, 200, nowPlaying);
      return send(response, result.status === 'rate-limited' ? 429 : 401, { status: result.status });
    }
    return send(response, 404, { status: 'not-found' });
  };

  return {
    /** Answers a request; a handler that fails answers 500 */
    handle: (request: IncomingMessage, response: ServerResponse) => {
      route(request, response).catch(() => send(response, 500, { status: 'error' }));
    },
    setNowPlaying: (snapshot: NowPlaying) => {
      nowPlaying = nowPlayingSchema.parse(snapshot);
    },
  };
};
