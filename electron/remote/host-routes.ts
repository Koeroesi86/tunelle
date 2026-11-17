import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccessControl, StoredDevice } from './access';
import { controlCommandSchema, permissionOf, type ControlCommand } from './control-command';
import { nowPlayingSchema, type NowPlaying } from './now-playing';

const MAX_BODY_BYTES = 4096;
const MAX_STREAMS = 20;
const HEARTBEAT_MS = 25_000;

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

interface Stream {
  response: ServerResponse;
  deviceId: string;
  secret: string;
}

/** The routes of the host and the now playing they answer with; no other route exists. See docs/app/remote-access-discovery.md */
export const createRoutes = (access: AccessControl, onControl: (command: ControlCommand) => void = () => undefined) => {
  let nowPlaying: NowPlaying = { state: 'idle' };
  const streams = new Set<Stream>();

  /** A device that was revoked or blocked since it connected is cut off here, so no event reaches it */
  const writeToStreams = (chunk: string) =>
    [...streams].forEach((stream) => {
      if (!access.authenticate(stream.deviceId, stream.secret)) return stream.response.end();
      stream.response.write(chunk);
    });

  const openStream = (response: ServerResponse, deviceId: string, secret: string) => {
    if (streams.size >= MAX_STREAMS) return send(response, 503, { status: 'full' });
    const stream = { response, deviceId, secret };
    const heartbeat = setInterval(() => writeToStreams(': ping\n\n'), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      streams.delete(stream);
    };
    response.on('close', close);
    response.on('error', close);
    streams.add(stream);
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    response.write(`data: ${JSON.stringify(nowPlaying)}\n\n`);
  };

  /** Runs the handler for an approved device, and answers 401 or 429 to anybody else */
  const authorized = (request: IncomingMessage, response: ServerResponse, handler: (device: StoredDevice, secret: string) => void) => {
    const { deviceId, secret } = credentials(request);
    const result = access.authorize(request.socket.remoteAddress ?? '', deviceId, secret);
    if (result.status === 'ok') return handler(result.device, secret);
    return send(response, result.status === 'rate-limited' ? 429 : 401, { status: result.status });
  };

  /** A command goes to the page only when the host allowed this control for this device; the approval alone is not enough */
  const control = (response: ServerResponse, device: StoredDevice, body: unknown) => {
    const parsed = controlCommandSchema.safeParse(body);
    if (!parsed.success) return send(response, 400, { status: 'invalid' });
    if (!device.controls.includes(permissionOf(parsed.data))) return send(response, 403, { status: 'forbidden' });
    onControl(parsed.data);
    return send(response, 200, { status: 'ok' });
  };

  const route = async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'https://host').pathname;
    if (request.method === 'POST' && path === '/remote/request') {
      const result = access.request(request.socket.remoteAddress ?? '', await readJson(request));
      return send(response, requestStatus[result.status], result);
    }
    if (request.method === 'GET' && path === '/remote/now-playing') return authorized(request, response, () => send(response, 200, nowPlaying));
    if (request.method === 'GET' && path === '/remote/events')
      return authorized(request, response, (device, secret) => openStream(response, device.id, secret));
    if (request.method === 'POST' && path === '/remote/control') {
      const body = await readJson(request);
      return authorized(request, response, (device) => control(response, device, body));
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
      writeToStreams(`data: ${JSON.stringify(nowPlaying)}\n\n`);
    },
  };
};
