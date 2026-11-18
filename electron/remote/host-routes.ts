import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccessControl, StoredDevice } from './access';
import { controlCommandSchema, type ControlCommand } from '../../shared/schemas/remote-control';
import { permissionOf } from './control-command';
import { relayResponse } from './relay-response';
import { nowPlayingSchema, type NowPlaying } from '../../shared/schemas/now-playing';

const MAX_BODY_BYTES = 4096;
const HEARTBEAT_MS = 25_000;

const requestStatus = { pending: 202, approved: 200, invalid: 400, blocked: 403, 'rate-limited': 429, full: 503 } as const;

const send = (response: ServerResponse, status: number, body: unknown = {}, headers: Record<string, string> = {}) => {
  if (response.headersSent) return response.end();
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
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

/** The file of a track as a fetch Response, with the range of the request */
export type ServeAudio = (trackPath: string, request: Request) => Promise<Response>;

interface Stream {
  response: ServerResponse;
  deviceId: string;
  secret: string;
}

/** The routes of the host and the now playing they answer with; no other route exists. See docs/app/remote-access-discovery.md */
export const createRoutes = (
  access: AccessControl,
  onControl: (command: ControlCommand) => void,
  serveAudio: ServeAudio | undefined,
  serveCover: ServeAudio | undefined,
  maxListeners: number
) => {
  let nowPlaying: NowPlaying = { state: 'idle' };
  let trackPath: string | undefined;
  let coverKey: string | undefined;
  const streams = new Set<Stream>();
  // the audio that is on its way to a device, which a revoke ends as it does an event stream
  const relays = new Set<Stream>();

  /** Ends what a device that was revoked or blocked since it connected still has open: its events and its audio */
  const closeRevoked = () =>
    [...streams, ...relays]
      .filter((stream) => !access.authenticate(stream.deviceId, stream.secret))
      .forEach((stream) => (streams.delete(stream), relays.delete(stream), stream.response.destroy()));

  const writeToStreams = (chunk: string) => {
    closeRevoked();
    streams.forEach((stream) => stream.response.write(chunk));
  };

  /** What a device may control, as an event of its own: the host changes it while the device listens, and it shows the buttons it can use */
  const controlsEvent = (stream: Stream) => `event: controls\ndata: ${JSON.stringify(access.authenticate(stream.deviceId, stream.secret)?.controls ?? [])}\n\n`;

  const openStream = (response: ServerResponse, deviceId: string, secret: string) => {
    // the limit counts devices, so a device that reconnects before its old stream is noticed as gone does not take a second place
    const connected = new Set([...streams].map((stream) => stream.deviceId));
    if (!connected.has(deviceId) && connected.size >= maxListeners) return send(response, 503, { status: 'full' });
    const stream = { response, deviceId, secret };
    const heartbeat = setInterval(() => writeToStreams(': ping\n\n'), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      streams.delete(stream);
    };
    response.on('close', close);
    response.on('error', close);
    streams.add(stream);
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-tunelle-time': String(Date.now()),
    });
    response.write(`data: ${JSON.stringify(nowPlaying)}\n\n`);
    response.write(controlsEvent(stream));
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

  /** The track that plays now, and only it: the path is the host's own and no request names a file */
  const audio = async (request: IncomingMessage, response: ServerResponse, device: StoredDevice, secret: string) => {
    if (!serveAudio || !trackPath) return send(response, 404, { status: 'no-track' });
    const abort = new AbortController();
    const relay = { response, deviceId: device.id, secret };
    relays.add(relay);
    response.on('close', () => {
      relays.delete(relay);
      abort.abort();
    });
    const headers = request.headers.range ? { range: request.headers.range } : undefined;
    const answer = await serveAudio(trackPath, new Request('https://host/remote/audio', { headers, signal: abort.signal }));
    return relayResponse(answer, response);
  };

  /** The cover of the track that plays now, and only it: the key is the host's own and no request names a file */
  const cover = async (request: IncomingMessage, response: ServerResponse) => {
    if (!serveCover || !coverKey) return send(response, 404, { status: 'no-cover' });
    const abort = new AbortController();
    response.on('close', () => abort.abort());
    return relayResponse(await serveCover(coverKey, new Request('https://host/remote/cover', { signal: abort.signal })), response);
  };

  const route = async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'https://host').pathname;
    if (request.method === 'POST' && path === '/remote/request') {
      const result = access.request(request.socket.remoteAddress ?? '', await readJson(request));
      return send(response, requestStatus[result.status], result);
    }
    if (request.method === 'GET' && path === '/remote/now-playing')
      return authorized(request, response, () => send(response, 200, nowPlaying, { 'x-tunelle-time': String(Date.now()) }));
    if (request.method === 'GET' && path === '/remote/events')
      return authorized(request, response, (device, secret) => openStream(response, device.id, secret));
    if (request.method === 'GET' && path === '/remote/audio')
      return authorized(request, response, (device, secret) => audio(request, response, device, secret).catch(() => response.destroy()));
    if (request.method === 'GET' && path === '/remote/cover')
      return authorized(request, response, () => cover(request, response).catch(() => response.destroy()));
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
    /** Ends what a device has open, and leaves it approved: it may connect again */
    disconnect: (deviceId: string) =>
      [...streams, ...relays]
        .filter((stream) => stream.deviceId === deviceId)
        .forEach((stream) => (streams.delete(stream), relays.delete(stream), stream.response.destroy())),
    /** After the controls of a device changed: each open stream is told what its device may control now */
    refreshControls: () => {
      closeRevoked();
      streams.forEach((stream) => stream.response.write(controlsEvent(stream)));
    },
    /** After the access changed: a device that is no longer approved loses its open streams at once, not at the next event */
    closeRevoked,
    /** `path` is the file of the track in the library and `cover` the key of its picture: they stay here and are never sent */
    setNowPlaying: (snapshot: NowPlaying, path?: string, cover?: string) => {
      trackPath = snapshot.state === 'idle' ? undefined : path;
      coverKey = snapshot.state === 'idle' ? undefined : cover;
      nowPlaying = nowPlayingSchema.parse(snapshot.state !== 'idle' && coverKey ? { ...snapshot, cover: true } : snapshot);
      writeToStreams(`data: ${JSON.stringify(nowPlaying)}\n\n`);
    },
  };
};
