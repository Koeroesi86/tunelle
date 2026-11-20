import { sourcePathSchema } from '@shared/schemas/sources';
import type { Sources } from '../services/sources/sources';
import { notFound } from './serve-file';

/** The audio or the cover of a track of a server of the user. The page names the track and never the server's address: the host comes from the stored server, so this is no open proxy. See docs/app/sources.md */
export const serveSource = async (kind: 'audio' | 'cover', path: string | null, request: Request, sources: Pick<Sources, 'clientOf'>) => {
  const ref = sourcePathSchema.safeParse(path).data;
  const client = ref && (await sources.clientOf(ref.serverId));
  if (!ref || !client) return notFound();

  return kind === 'audio'
    ? client.stream(ref.id, request.headers.get('range') ?? undefined, request.signal).catch(() => new Response(undefined, { status: 502 }))
    : client.cover(ref.id, request.signal).catch(() => new Response(undefined, { status: 502 }));
};
