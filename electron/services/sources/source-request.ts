import { request as httpRequest, type IncomingMessage, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { TLSSocket } from 'node:tls';
import { toWebStream } from '../../utils/to-web-stream';
import { pinnedOptions, unpinnedOptions } from '../../remote/certificate';

const requestTimeout = 10000;
const maxJsonBytes = 16 * 1024 * 1024;

/** The code of a wrong user or password, as Subsonic numbers it; the other sources use it for their own refusal of a login */
export const wrongLoginCode = 40;

/** A server that answered, and what it answered is an error with a code the page can word in its language */
export class SourceError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
  }
}

interface OpenOptions {
  method?: 'GET' | 'POST';
  /** A JSON body, sent with `POST` */
  body?: string;
  /** The certificate the user approved: the only one that is accepted. Without it the certificate must be valid */
  certificate?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** The first contact with a self-signed server reads the certificate and sends nothing secret */
  unpinned?: boolean;
}

/** One request (a GET unless told); the answer is there as soon as its headers are, and only the wait for them has a limit, as a player may read the body slowly */
const attempt = (url: URL, { certificate, headers, signal, unpinned, method = 'GET', body }: OpenOptions = {}) =>
  new Promise<IncomingMessage>((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const tls = { ...(unpinned ? unpinnedOptions : {}), ...(certificate && !unpinned ? pinnedOptions(certificate) : {}) };
    // no pooled socket: an idle one that the server closes raises EPIPE with no request left to take the error
    const outgoing = (secure ? httpsRequest : httpRequest)(
      url,
      { agent: false, method, headers: body ? { 'Content-Type': 'application/json', ...headers } : headers, signal, timeout: requestTimeout, ...tls },
      (response) => {
        outgoing.setTimeout(0);
        resolve(response);
      }
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error(`${url.host} did not answer`)));
    outgoing.on('error', reject);
    outgoing.end(body);
  });

/** A server that is asked too much says so with 429 or 503, and when to ask again: that is waited for, a little and a few times, with the wait it names */
const retriedStatuses = [429, 503];
const retries = 2;
const longestWait = 5000;

const waitOf = (response: IncomingMessage, retry: number) => {
  const seconds = Number(response.headers['retry-after']);
  return Math.min(Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 500 * 2 ** retry, longestWait);
};

const pause = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** One request (a GET unless told); a GET that is refused for asking too much is asked again after the wait the server names */
export const openSource = async (url: URL, options: OpenOptions = {}): Promise<IncomingMessage> => {
  const response = await attempt(url, options);
  const again = (options.method ?? 'GET') === 'GET' && retriedStatuses.includes(response.statusCode ?? 0);

  return again ? retryAfter(response, url, options, 0) : response;
};

const retryAfter = async (refused: IncomingMessage, url: URL, options: OpenOptions, retry: number): Promise<IncomingMessage> => {
  const wait = waitOf(refused, retry);
  refused.destroy();
  await pause(wait, options.signal);

  const response = await attempt(url, options);
  const last = retry + 1 >= retries || options.signal?.aborted === true;

  return !last && retriedStatuses.includes(response.statusCode ?? 0) ? retryAfter(response, url, options, retry + 1) : response;
};

const pem = (der: Buffer) => `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`;

/** The certificate that a server presents, for the user to approve; nothing is sent to it but the request for its page */
export const readCertificate = async (url: URL) => {
  const response = await openSource(new URL(url.origin), { unpinned: true });
  const certificate = response.socket instanceof TLSSocket ? pem(response.socket.getPeerCertificate().raw) : undefined;
  response.destroy();
  if (!certificate) throw new Error(`${url.host} does not use TLS`);

  return certificate;
};

/** Passes the chunks of a body on and ends the answer with an error when they add up to more than a list may be */
const limitBody = (response: IncomingMessage, host: string) => {
  let length = 0;

  return (chunk: Buffer) => {
    length += chunk.length;
    if (length <= maxJsonBytes) return chunk;

    response.destroy();
    throw new Error(`The answer of ${host} is too long`);
  };
};

/** The body of an answer as JSON; a status outside 200-299, a body that is too long and one that is not JSON fail */
export const readJson = async (response: IncomingMessage, host: string): Promise<unknown> => {
  if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
    response.destroy();
    throw new Error(`${host} answered ${response.statusCode}`);
  }

  const chunks: Buffer[] = [];
  const limit = limitBody(response, host);
  for await (const chunk of response) chunks.push(limit(chunk));

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const keptHeaders = (headers: IncomingHttpHeaders, names: string[]) =>
  Object.fromEntries(names.flatMap((name) => (headers[name] ? [[name, String(headers[name])]] : [])));

/** The answer as a `Response` with the headers a player needs to play and seek, the body is not read until the player reads it */
export const toResponse = (response: IncomingMessage) => {
  const withBody = response.statusCode !== 204 && response.statusCode !== 304;
  const headers = keptHeaders(response.headers, ['content-type', 'content-length', 'content-range', 'accept-ranges']);

  return new Response(withBody ? toWebStream(response) : null, { status: response.statusCode ?? 502, headers });
};
