import { openRadioStream } from './radio-proxy';
import type { RadioStreamDeps } from './radio-proxy';
import { stationUuid } from '../constants/radio';

/** Plays a station: the audio as it arrives without the ICY metadata, and the connection to the station closes when the player cancels or aborts the request */
export const serveRadio = async (uuid: string, signal: AbortSignal, deps: RadioStreamDeps) => {
  if (!stationUuid.test(uuid)) return new Response(undefined, { status: 404 });

  const abort = new AbortController();
  signal.addEventListener('abort', () => abort.abort());

  try {
    const { contentType, audio } = await openRadioStream(uuid, abort.signal, deps);
    const chunks = audio[Symbol.asyncIterator]();
    // a pull per chunk keeps the pace of the player, and a cancelled response destroys the stream: the upstream connection ends with it
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => chunks.next().then(({ done, value }) => (done ? controller.close() : controller.enqueue(value))),
      cancel: () => {
        audio.destroy();
        abort.abort();
      },
    });

    return new Response(body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' } });
  } catch {
    return new Response(undefined, { status: 502 });
  }
};
