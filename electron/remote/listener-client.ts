import { request, type RequestOptions } from 'node:https';
import { TLSSocket } from 'node:tls';
import { z } from 'zod';
import { approvalCode, pinnedOptions, unpinnedOptions } from './certificate';
import { nowPlayingSchema, type NowPlaying } from './now-playing';

const TIMEOUT_MS = 5000;
const MAX_ANSWER_BYTES = 64 * 1024;
/** A listener that is further from the host than this seeks; smaller steps are left to the audio clock */
export const DRIFT_SECONDS = 0.5;

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
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')), certificate });
        } catch {
          resolve({ status: response.statusCode ?? 0, body: undefined, certificate });
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
  return nowPlayingSchema.parse(answer.body);
};

/** Where the host is now, from its snapshot: a playing track runs on from the time of the snapshot */
export const expectedPosition = (snapshot: NowPlaying): number | undefined => {
  if (snapshot.state === 'idle') return undefined;
  if (snapshot.state === 'paused') return snapshot.position;
  return snapshot.position + Math.max(0, Date.now() - snapshot.at) / 1000;
};

/** The position to seek to, or `undefined` when the listener is close enough */
export const driftCorrection = (snapshot: NowPlaying, localPosition: number): number | undefined => {
  const expected = expectedPosition(snapshot);
  if (expected === undefined) return undefined;
  return Math.abs(expected - localPosition) > DRIFT_SECONDS ? expected : undefined;
};
