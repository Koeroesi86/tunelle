import http from 'http';
import https from 'https';
import { PassThrough, pipeline } from 'stream';
import { IcyMetadataStripper } from './icyMetadata';

export interface RadioStreamDeps {
  /** The address of the stream of a station */
  resolveStream: (uuid: string) => Promise<string>;
  onTitle: (uuid: string, title: string, streamUrl?: string) => void;
}

const maxRedirects = 5;

/** Not `fetch`: the undici of Node asserts in its parser when a station closes the socket while the body is paused, and that error is thrown from the socket where nothing can catch it */
const openUpstream = (address: string, signal: AbortSignal, redirects = maxRedirects): Promise<http.IncomingMessage> =>
  new Promise((resolve, reject) => {
    const url = new URL(address);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      reject(new Error('The stream is not an http address'));
      return;
    }
    const request = (url.protocol === 'https:' ? https : http).get(url, { headers: { 'Icy-MetaData': '1' }, signal });
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

export const stationUuid = /^[0-9a-zA-Z-]{1,64}$/;

/** The audio of a station without its ICY metadata, whose titles go to `onTitle`; aborting the signal closes the upstream connection */
export const openRadioStream = async (uuid: string, signal: AbortSignal, { resolveStream, onTitle }: RadioStreamDeps) => {
  const upstream = await openUpstream(await resolveStream(uuid), signal);

  const metaint = Number(upstream.headers['icy-metaint']);
  const strippers = metaint > 0 ? [new IcyMetadataStripper(metaint, (title, streamUrl) => onTitle(uuid, title, streamUrl))] : [];

  // one pipeline: destroying the audio ends every stage, and the abort of the upstream is an end, not an unhandled error that opens an error dialog and holds the app
  const audio = new PassThrough();
  pipeline([upstream, ...strippers, audio], () => undefined);

  return { contentType: upstream.headers['content-type'] ?? 'audio/mpeg', audio };
};
