import { sourcePathSchema } from '@shared/schemas/sources';
import type { Sources } from '../services/sources/sources';
import { createGate } from '../services/sources/request-gate';
import { notFound } from './serve-file';

/** A window of tiles asks for dozens of covers at once: few run at a time for a server, the others wait */
const coverInTurn = createGate(6);

/** A cover is kept for a day by the page, an answer that is an error is not kept */
const kept = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', response.ok ? 'private, max-age=86400' : 'no-store');

  return new Response(response.body, { status: response.status, headers });
};

/** The audio or the cover of a track of a server of the user. The page names the track and never the server's address: the host comes from the stored server, so this is no open proxy. See docs/app/sources.md */
export const serveSource = async (kind: 'audio' | 'cover', path: string | null, request: Request, sources: Pick<Sources, 'clientOf'>) => {
  const ref = sourcePathSchema.safeParse(path).data;
  const client = ref && (await sources.clientOf(ref.serverId));
  if (!ref || !client) return notFound();

  return kind === 'audio'
    ? client.stream(ref.id, request.headers.get('range') ?? undefined, request.signal).catch(() => new Response(undefined, { status: 502 }))
    : coverInTurn(ref.serverId, () => client.cover(ref.id, request.signal))
        .then(kept)
        .catch(() => new Response(undefined, { status: 502, headers: { 'Cache-Control': 'no-store' } }));
};
