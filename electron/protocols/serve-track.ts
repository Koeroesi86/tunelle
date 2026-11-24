import type { Database } from 'sqlite3';
import { findPlayableTrack } from '../repositories/library-repository';
import { playableFile, type PlayableTrack } from './decoded-track';
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
  return track ? servePlayable(track, request) : notFound();
};

/** A file that may need decoding, served with the range of the request: while ffmpeg writes it when its length is known, or whole */
export const servePlayable = async (track: PlayableTrack, request: Request) => {
  const progressive = await growingTrack(track, request.signal);
  if (progressive && typeof progressive !== 'string') return serveGrowing(progressive, request);
  const file = progressive ?? (await playableFile(track, request.signal));
  return file ? serveFile(file, request) : notFound();
};
