import path from 'node:path';
import { resolveAlbumArt } from '../library/art/album-art';
import { notFound, serveFile } from '../protocols/serve-file';

/** The cover of the track that plays, by the name of its optimized picture in the album art folder; the name is the page's own and never a path */
export const serveCover = async (key: string, request: Request) => {
  const file = await resolveAlbumArt(path.basename(key));
  return file ? serveFile(file, request, { 'Cache-Control': 'no-store' }) : notFound();
};
