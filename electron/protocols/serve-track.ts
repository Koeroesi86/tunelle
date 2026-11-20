import type { Database } from 'sqlite3';
import { findPlayableTrack } from '../repositories/library-repository';
import { playableFile } from './decoded-track';
import { growingTrack } from './growing-track';
import { findOpenedTrack } from '../library/opened/opened-files';
import { notFound, serveFile } from './serve-file';
import { serveGrowing } from './serve-growing';

/** A file of the library, or one that the system opened (docs/app/open-files.md), with the range of the request. The path is looked up in the database and the opened files, so nothing else is served; a format that Chromium does not play is decoded first (docs/app/decoder-proxy.md) */
export const serveTrack = async (database: Database | undefined, filePath: string | undefined, request: Request) => {
  const opened = filePath ? findOpenedTrack(filePath) : undefined;
  const track =
    (database && filePath ? await findPlayableTrack(database, filePath) : undefined) ??
    (opened && { path: opened.path, codec: opened.codec ?? null, bitDepth: opened.bitDepth ?? null });
  const progressive = track ? await growingTrack(track, request.signal) : undefined;
  if (progressive && typeof progressive !== 'string') return serveGrowing(progressive, request);
  const file = progressive ?? (track ? await playableFile(track, request.signal) : undefined);
  return file ? serveFile(file, request) : notFound();
};
