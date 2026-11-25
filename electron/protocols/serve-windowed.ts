import type { RouteRequest } from './request-aborts';
import { parseRange } from './serve-file';
import type { WindowedTrack } from './windowed-track';

/** A WAV that is decoded as it is read, with the size and the ranges of the whole file; a range that is not decoded yet waits. See docs/app/decoder-proxy.md */
export const serveWindowed = (track: WindowedTrack, request: RouteRequest) => {
  const range = request.headers.get('range');
  const bounds = range ? parseRange(range, track.size) : undefined;
  if (range && !bounds) return new Response(undefined, { status: 416, headers: { 'Content-Range': `bytes */${track.size}` } });

  const start = bounds?.start ?? 0;
  const end = bounds?.end ?? track.size - 1;
  const chunks = track.read(start, end, request.signal);
  const body = new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: async () => {
      await chunks.return(undefined);
    },
  });

  return new Response(body, {
    status: bounds ? 206 : 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      ...(bounds ? { 'Content-Range': `bytes ${start}-${end}/${track.size}` } : {}),
    },
  });
};
