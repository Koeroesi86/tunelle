import { sourcePathSchema } from '@shared/schemas/sources';
import type { Sources } from '../services/sources/sources';
import { createGate, Dropped } from '../services/sources/request-gate';
import { z } from 'zod';
import { isDecodedCodec } from '../utils/is-supported';
import { isAmbiguousContainer, toCodecName } from '../utils/codec-name';
import { downloadedFormat } from './source-format';
import { arrivalOf } from './decoded-track';
import { downloadSource } from './source-download';
import { answerHolding } from './held-files';
import type { RouteRequest } from './request-aborts';
import { servePlayable } from './serve-track';
import { notFound } from './serve-file';

/** The codec or container of the track, which the page has from the metadata of the server */
const formatSchema = z.object({ codec: z.string().max(32).optional() });

/** Whether the file may be one that ffmpeg decodes */
const isDownloaded = (codec: string | null) => isDecodedCodec(codec) || isAmbiguousContainer(codec);

/** A window of tiles asks for dozens of covers at once: few run at a time for a server, the others wait */
const coverInTurn = createGate(6);

let covers = 0;

/** A cover that the page no longer wants (its tile scrolled away, so the request is aborted) is not fetched if it still waits for its turn */
const coverWaiting = <T>(serverId: string, signal: AbortSignal, task: () => Promise<T>) => {
  const tag = String(covers++);
  signal.addEventListener('abort', () => coverInTurn.drop(serverId, (queued) => queued === tag), { once: true });

  return coverInTurn(serverId, () => (signal.aborted ? Promise.reject(new Dropped()) : task()), tag);
};

/** A cover is kept for a day by the page, an answer that is an error is not kept */
const kept = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', response.ok ? 'private, max-age=86400' : 'no-store');

  return new Response(response.body, { status: response.status, headers });
};

/** The audio or the cover of a track of a server of the user. The page names the track and never the server's address: the host comes from the stored server, so this is no open proxy. See docs/app/sources.md */
export const serveSource = async (kind: 'audio' | 'cover', path: string | null, request: RouteRequest, sources: Pick<Sources, 'clientOf'>) => {
  const codec = toCodecName(formatSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)).data?.codec);
  const ref = sourcePathSchema.safeParse(path).data;
  const client = ref && (await sources.clientOf(ref.serverId));
  if (!ref || !client) return notFound();

  // the place in the queue of the decodes: the download of the next track may end first
  arrivalOf(request.signal);

  // a codec that the bundled ffmpeg decodes is downloaded and decoded like a file of the library, so it plays and can be sought; the file, not the name of the server, tells its format
  const file = kind === 'audio' && isDownloaded(codec) ? await downloadSource(path ?? '', client, ref.id, request.signal) : undefined;
  if (file) return answerHolding(file, async () => servePlayable({ path: file, ...(await downloadedFormat(file)) }, request));

  return kind === 'audio'
    ? client.stream(ref.id, request.headers.get('range') ?? undefined, request.signal).catch(() => new Response(undefined, { status: 502 }))
    : coverWaiting(ref.serverId, request.signal, () => client.cover(ref.id, request.signal))
        .then(kept)
        .catch(() => new Response(undefined, { status: 502, headers: { 'Cache-Control': 'no-store' } }));
};
