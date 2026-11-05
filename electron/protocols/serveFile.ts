import { stat } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { net } from 'electron';
import mimeType from 'mime-types';

/** Resolve a single `bytes=start-end` or `bytes=-suffix` range, undefined when it cannot be satisfied */
const parseRange = (range: string, fileSize: number) => {
  const parts = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!parts || (parts[1] === '' && parts[2] === '')) return undefined;
  const start = parts[1] === '' ? Math.max(fileSize - parseInt(parts[2], 10), 0) : parseInt(parts[1], 10);
  const end = parts[1] === '' || parts[2] === '' ? fileSize - 1 : Math.min(parseInt(parts[2], 10), fileSize - 1);
  return start <= end && start < fileSize ? { start, end } : undefined;
};

export const notFound = () => new Response(undefined, { status: 404 });

/**
 * Serves a file with the range of the request. net.fetch slices the file for a range, but it answers 200 without a Content-Range and without a
 * Content-Length, which an <audio> element can not seek with, and takes the type from the system: so the headers are set here.
 */
export const serveFile = async (filePath: string, request: Request, headers: Record<string, string> = {}) => {
  const stats = await stat(filePath).catch(() => undefined);
  if (!stats?.isFile()) return notFound();

  const range = request.headers.get('range');
  const bounds = range ? parseRange(range, stats.size) : undefined;
  if (range && !bounds) return new Response(undefined, { status: 416, headers: { 'Content-Range': `bytes */${stats.size}` } });

  // the file can vanish after the check
  const file = await net
    .fetch(pathToFileURL(filePath).href, { headers: bounds ? { range: `bytes=${bounds.start}-${bounds.end}` } : {} })
    .catch(() => undefined);
  if (!file) return notFound();

  const responseHeaders = {
    'Content-Type': mimeType.contentType(path.extname(filePath)) || 'application/octet-stream',
    'Content-Length': String(bounds ? bounds.end - bounds.start + 1 : stats.size),
    'Accept-Ranges': 'bytes',
    ...(bounds ? { 'Content-Range': `bytes ${bounds.start}-${bounds.end}/${stats.size}` } : {}),
    ...headers,
  };

  return new Response(file.body, { status: bounds ? 206 : 200, headers: responseHeaders });
};
