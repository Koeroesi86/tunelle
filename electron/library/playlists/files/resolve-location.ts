import path from 'path';
import normalizePath from '../../../utils/normalize-path';

export type ResolvedLocation = { kind: 'file'; path: string } | { kind: 'stream' };

const schemePattern = /^[a-z][a-z0-9+.-]+:\/\//i;
/** posix.normalize takes `//host/share` for `/host/share`, and a network share keeps its two slashes */
const normalizeKeepingShare = (filePath: string) => {
  const normalized = path.posix.normalize(filePath);
  return /^\/\/[^/]/.test(filePath) ? `/${normalized}` : normalized;
};

const absolutePattern = /^(\/|[A-Za-z]:\/)/;

/** The path of a `file:` URI as a path with forward slashes: `/C:/Music/a.flac` loses the slash before the drive, another host is a network share */
const fileUriToPath = (location: string) => {
  const url = URL.canParse(location) ? new URL(location) : undefined;
  if (!url) return undefined;

  const pathname = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1');
  return url.hostname && url.hostname !== 'localhost' ? `//${url.hostname}${pathname}` : pathname;
};

/** Where a line of a playlist file points, as the path the library would store it (forward slashes, the relative ones taken from the folder of the playlist file); an address on the network is a stream. See docs/app/playlist-import.md */
export const resolveLocation = (location: string, playlistFolder: string): ResolvedLocation | undefined => {
  if (/^file:/i.test(location)) {
    const filePath = fileUriToPath(location);
    return filePath ? { kind: 'file', path: normalizeKeepingShare(filePath) } : undefined;
  }
  if (schemePattern.test(location)) return { kind: 'stream' };

  const slashed = normalizePath(location);
  return { kind: 'file', path: normalizeKeepingShare(absolutePattern.test(slashed) ? slashed : `${normalizePath(playlistFolder)}/${slashed}`) };
};
