import type { Database } from 'sqlite3';
import { findPlayableTrack } from '../repositories/library-repository';
import { arrivalOf, playableFile, type PlayableTrack } from './decoded-track';
import { findOpenedTrack } from '../library/opened/opened-files';
import type { RouteRequest } from './request-aborts';
import { notFound, serveFile } from './serve-file';
import { serveWindowed } from './serve-windowed';
import { answerHolding } from './held-files';
import { windowedTrack } from './windowed-track';

/** A file of the library, or one that the system opened (docs/app/open-files.md), with the range of the request. The path is looked up in the database and the opened files, so nothing else is served; a format that Chromium does not play is decoded first (docs/app/decoder-proxy.md) */
export const serveTrack = async (database: Database | undefined, filePath: string | undefined, request: RouteRequest) => {
  // the place in the queue of the decodes, before the lookup
  arrivalOf(request.signal);
  const opened = filePath ? findOpenedTrack(filePath) : undefined;
  const track =
    (database && filePath ? await findPlayableTrack(database, filePath) : undefined) ??
    (opened && { path: opened.path, codec: opened.codec ?? null, bitDepth: opened.bitDepth ?? null });
  return track ? servePlayable(track, request) : notFound();
};

/** A file that may need decoding, served with the range of the request: decoded as it is read when its length is known, or whole first */
export const servePlayable = async (track: PlayableTrack, request: RouteRequest) => {
  const progressive = await windowedTrack(track, request.signal);
  if (progressive) return serveWindowed(progressive, request);
  // the loudness measurement marks its requests, its decodes wait for the ones of the player
  const file = await playableFile(track, request.signal, new URL(request.url).searchParams.has('measure'));
  if (!file) return notFound();
  // a decoded copy stays in the cache while it is read
  return file === track.path ? serveFile(file, request) : answerHolding(file, () => serveFile(file, request));
};
