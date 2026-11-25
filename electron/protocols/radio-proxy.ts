import http from 'http';
import https from 'https';
import { PassThrough, pipeline } from 'stream';
import { IcyMetadataStripper } from './icy-metadata';
import { detectStreamCodec } from '@shared/utils/stream-sample-rate';
import { SampleRateTap } from './sample-rate-tap';
import { decodeStream, peekStream, replay } from './stream-decode';
import { isDecodedCodec } from '../utils/is-supported';

export interface RadioStreamDeps {
  /** The address of the stream of a station */
  resolveStream: (uuid: string) => Promise<string>;
  onTitle: (uuid: string, title: string, streamUrl?: string) => void;
  /** The sample rate of the audio of a station, found in the start of its stream */
  onSampleRate: (uuid: string, sampleRate: number) => void;
}

const maxRedirects = 5;
/** A station that sends nothing for this long, while connecting or while playing, is cut off, so the player asks it again instead of waiting on a stream that hangs */
const idleTimeout = 20_000;

/** Not `fetch`: the undici of Node asserts in its parser when a station closes the socket while the body is paused, and that error is thrown from the socket where nothing can catch it */
const openUpstream = (address: string, signal: AbortSignal, redirects = maxRedirects): Promise<http.IncomingMessage> =>
  new Promise((resolve, reject) => {
    const url = new URL(address);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      reject(new Error('The stream is not an http address'));
      return;
    }
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      headers: { 'Icy-MetaData': '1', 'User-Agent': 'Tunelle' },
      signal,
      timeout: idleTimeout,
    });
    request.on('timeout', () => request.destroy(new Error('The stream sent nothing')));
    // an error after the answer ends the audio through the pipeline, and never reaches the main process unhandled
    request.on('error', reject);
    request.on('response', (response) => {
      const location = response.headers.location;
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        resolve(
          redirects > 0 ? openUpstream(new URL(location, url).href, signal, redirects - 1) : Promise.reject(new Error('The stream redirected too often'))
        );
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`The stream answered ${status}`));
        return;
      }
      resolve(response);
    });
  });

/** The audio of a station without its ICY metadata, whose titles go to `onTitle` and whose sample rate goes to `onSampleRate`; aborting the signal closes the upstream connection */
export const openRadioStream = async (uuid: string, signal: AbortSignal, { resolveStream, onTitle, onSampleRate }: RadioStreamDeps) => {
  const upstream = await openUpstream(await resolveStream(uuid), signal);

  const metaint = Number(upstream.headers['icy-metaint']);
  const strippers = metaint > 0 ? [new IcyMetadataStripper(metaint, (title, streamUrl) => onTitle(uuid, title, streamUrl))] : [];
  // one pipeline: destroying the audio ends every stage, and the abort of the upstream is an end, not an unhandled error that opens an error dialog and holds the app
  const clean = new PassThrough();
  pipeline([upstream, ...strippers, clean], () => undefined);

  // a codec that the bundled ffmpeg decodes is decoded by it, any other (AAC) and a stream with no known format play in Chromium as they come. See docs/app/decoder-proxy.md
  const head = await peekStream(clean, detectStreamCodec);
  // a stream that was aborted has ended: ffmpeg would wait on it for ever
  signal.throwIfAborted();
  const decoded = isDecodedCodec(detectStreamCodec(head)) ? await decodeStream(head, clean, (sampleRate) => onSampleRate(uuid, sampleRate)) : undefined;
  if (decoded) return { contentType: 'audio/wav', audio: decoded };

  const audio = new PassThrough();
  pipeline([replay(head, clean), new SampleRateTap((sampleRate) => onSampleRate(uuid, sampleRate)), audio], () => undefined);

  return { contentType: upstream.headers['content-type'] ?? 'audio/mpeg', audio };
};
