import type { IncomingMessage } from 'node:http';
import { request, type RequestOptions } from 'node:https';
import { TLSSocket } from 'node:tls';
import { z } from 'zod';
import { approvalCode, pinnedOptions, unpinnedOptions } from './certificate';
import { nowPlayingSchema, type NowPlaying } from '../../shared/schemas/now-playing';

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

/** The now playing of the host, or `undefined` when the host does not know this device (revoked, blocked or never approved) */
export const fetchNowPlaying = async (address: HostAddress, certificate: string, deviceId: string, secret: string): Promise<NowPlaying | undefined> => {
  const answer = await call(address, pinnedOptions(certificate), 'GET', '/remote/now-playing', {
    'x-tunelle-device': deviceId,
    authorization: `Bearer ${secret}`,
  });
  if (answer.status === 401) return undefined;
  if (answer.status !== 200) throw new Error(`The host answered ${answer.status}`);
  const snapshot = nowPlayingSchema.parse(answer.body);
  // the host stamps its snapshot with its own clock: the offset between the clocks is taken from the answer, so a listener
  // whose clock is seconds off still seeks to the right place (the time of the answer on the way is left, it is a LAN)
  if (snapshot.state === 'idle' || answer.hostTime === undefined) return snapshot;
  return { ...snapshot, at: snapshot.at + (Date.now() - answer.hostTime) };
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
