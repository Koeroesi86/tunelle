import type { IncomingMessage } from 'node:http';
import { request, type RequestOptions } from 'node:https';
import { TLSSocket } from 'node:tls';
import { z } from 'zod';
import { approvalCode, pinnedOptions, unpinnedOptions } from './certificate';
import { CONTROLS, type Control } from '../../shared/constants/remote-controls';
import { nowPlayingSchema, type NowPlaying } from '../../shared/schemas/now-playing';
import type { ControlCommand } from '../../shared/schemas/remote-control';

const TIMEOUT_MS = 5000;
const MAX_ANSWER_BYTES = 64 * 1024;

export interface HostAddress {
  host: string;
  port: number;
}

export interface Contact {
  /** The certificate of the host, to be pinned when the user approves the code */
  certificate: string;
  code: string;
}

const requestAnswerSchema = z.object({ status: z.string(), secret: z.string().optional() });
export type RequestAnswer = z.infer<typeof requestAnswerSchema>;

const pem = (der: Buffer) => `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`;

interface Call {
  status: number;
  /** The clock of the host when it answered, to put its snapshot on the clock of this computer */
  hostTime: number | undefined;
  body: unknown;
  certificate: string;
}

/** One request; it fails with an error (never throws elsewhere), a body that is too long or not JSON is `undefined` */
const call = (address: HostAddress, tls: RequestOptions, method: string, path: string, headers: Record<string, string> = {}, body?: unknown) =>
  new Promise<Call>((resolve, reject) => {
    // no pooled socket: an idle one that the host closes raises EPIPE with no request left to take the error
    const outgoing = request({ ...address, agent: false, method, path, headers, timeout: TIMEOUT_MS, ...tls }, (response) => {
      if (!(response.socket instanceof TLSSocket)) return reject(new Error('Not a TLS socket'));
      const certificate = pem(response.socket.getPeerCertificate().raw);
      const hostTime = Number(response.headers['x-tunelle-time']) || undefined;
      const chunks: Buffer[] = [];
      let length = 0;
      response.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > MAX_ANSWER_BYTES) return response.destroy(new Error('The answer of the host is too long'));
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode ?? 0, hostTime, body: JSON.parse(Buffer.concat(chunks).toString('utf8')), certificate });
        } catch {
          resolve({ status: response.statusCode ?? 0, hostTime, body: undefined, certificate });
        }
      });
    });
    outgoing.on('timeout', () => outgoing.destroy(new Error('The host did not answer')));
    outgoing.on('error', reject);
    outgoing.end(body === undefined ? undefined : JSON.stringify(body));
  });

/** The first contact: nothing is sent but a request without credentials, and the certificate it presents gives the code for both screens */
export const contact = async (address: HostAddress): Promise<Contact> => {
  const { certificate } = await call(address, unpinnedOptions, 'GET', '/remote/now-playing');
  return { certificate, code: approvalCode(certificate) };
};

/** Asks to listen, or asks again for the answer: an approved device gets its secret in the first answer after the approval */
export const requestToListen = async (
  address: HostAddress,
  certificate: string,
  body: { deviceId: string; deviceName: string; note: string }
): Promise<RequestAnswer> => {
  const answer = await call(address, pinnedOptions(certificate), 'POST', '/remote/request', {}, body);
  return requestAnswerSchema.parse(answer.body);
};

const controlsSchema = z.array(z.enum(CONTROLS));

const parsed = <T>(schema: z.ZodType<T>, json: string) => {
  try {
    return schema.safeParse(JSON.parse(json)).data;
  } catch {
    return undefined;
  }
};

export interface HostEvents {
  onSnapshot: (snapshot: NowPlaying) => void;
  /** What this device may control, sent when the stream opens and each time the host changes it */
  onControls: (controls: Control[]) => void;
}

/** The host sends a ping every 25 s, so a stream that is silent for this long is gone */
const EVENTS_IDLE_MS = 60_000;

/**
 * The now playing of the host as it changes (`/remote/events`), each snapshot on the clock of this computer.
 * Resolves with `revoked` when the host does not know this device (401) and with `ended` when the host closed the stream; a failure rejects
 */
export const followNowPlaying = (address: HostAddress, certificate: string, deviceId: string, secret: string, events: HostEvents, signal: AbortSignal) =>
  new Promise<'revoked' | 'ended'>((resolve, reject) => {
    const headers = { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}` };
    const outgoing = request(
      { ...address, ...pinnedOptions(certificate), agent: false, method: 'GET', path: '/remote/events', headers, timeout: EVENTS_IDLE_MS, signal },
      (response) => {
        if (response.statusCode === 401) return resolve((response.resume(), 'revoked'));
        if (response.statusCode !== 200) return reject((response.resume(), new Error(`The host answered ${response.statusCode}`)));
        // the offset between the clocks is taken once, when the stream opens: the host stamps each snapshot with its own clock
        const hostTime = Number(response.headers['x-tunelle-time']) || undefined;
        const offset = hostTime === undefined ? 0 : Date.now() - hostTime;
        let pending = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          const messages = (pending + chunk).split('\n\n');
          pending = messages.pop() ?? '';
          if (pending.length > MAX_ANSWER_BYTES) return response.destroy(new Error('The answer of the host is too long'));
          messages.forEach((message) => {
            const lines = message.split('\n');
            const data = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '';
            const isControls = lines.includes('event: controls');
            const controls = isControls ? parsed(controlsSchema, data) : undefined;
            const snapshot = isControls ? undefined : parsed(nowPlayingSchema, data);
            if (controls) events.onControls(controls);
            if (snapshot) events.onSnapshot(snapshot.state === 'idle' ? snapshot : { ...snapshot, at: snapshot.at + offset });
          });
        });
        response.on('error', reject);
        response.on('end', () => resolve('ended'));
      }
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('The host did not answer')));
    outgoing.on('error', reject);
    outgoing.end();
  });

/** A command to the host. Resolves when the host did it; a command the host did not allow (403) or could not read rejects with that */
export const sendControl = async (address: HostAddress, certificate: string, deviceId: string, secret: string, command: ControlCommand) => {
  const answer = await call(
    address,
    pinnedOptions(certificate),
    'POST',
    '/remote/control',
    { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    command
  );
  if (answer.status !== 200) throw new Error(`The host answered ${answer.status}`);
};

// a stream of the answer that reads on demand: a player that stops reading holds the socket, and a cancel closes it
const toWebStream = (response: IncomingMessage) => {
  const chunks = response[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: () => {
      response.destroy();
    },
  });
};

const audioHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

/** The audio of the track the host plays now, with the range of the request (so the player can seek); the answer is a stream and a failure before it is an error */
export const fetchAudio = (address: HostAddress, certificate: string, deviceId: string, secret: string, range: string | undefined, signal: AbortSignal) =>
  new Promise<Response>((resolve, reject) => {
    const headers = { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}`, ...(range ? { range } : {}) };
    const outgoing = request(
      { ...address, ...pinnedOptions(certificate), agent: false, method: 'GET', path: '/remote/audio', headers, timeout: TIMEOUT_MS, signal },
      (response) => {
        // the stream may wait as long as the player does not read, so only the wait for the answer has a limit
        outgoing.setTimeout(0);
        const kept = Object.fromEntries(audioHeaders.flatMap((name) => (response.headers[name] ? [[name, String(response.headers[name])]] : [])));
        const withBody = response.statusCode !== 204 && response.statusCode !== 304;
        resolve(new Response(withBody ? toWebStream(response) : null, { status: response.statusCode ?? 502, headers: kept }));
      }
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('The host did not answer')));
    outgoing.on('error', reject);
    outgoing.end();
  });
