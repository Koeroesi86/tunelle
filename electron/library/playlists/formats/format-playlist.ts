import path from 'path';
import { nothingKept } from '../files/kept-lines';
import type { KeptLines } from '../files/kept-lines';
import type { PlaylistFormat } from '../files/playlist-files';

export interface ExportEntry {
  path: string;
  title?: string;
  artist?: string;
  album?: string;
  /** Seconds */
  duration?: number;
}

export interface ExportPlaylist {
  name: string;
  /** The folder of the file that is written, with forward slashes */
  folder: string;
  entries: ExportEntry[];
  /** The folders of the library: a track in one of them is written relative to the folder of the file, also when that goes up */
  roots?: string[];
  /** Lines of the earlier file that are written again */
  kept?: KeptLines;
}

/** A line of a playlist file holds one value, so a line break in a title is a space */
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

const driveOf = (location: string) => /^([A-Za-z]:|\/\/[^/]+)/.exec(location)?.[0].toLowerCase() ?? '';

const isInside = (trackPath: string, folder: string) => trackPath.startsWith(`${folder.replace(/\/+$/, '')}/`);

/** A track of the library that cannot be written relative to the file as it is on another drive or share */
export const isOnAnotherDrive = (trackPath: string, folder: string, roots: string[] = []) =>
  roots.some((root) => isInside(trackPath, root)) && driveOf(trackPath) !== driveOf(folder);

/** The path as it is written: relative to the folder of the file (with /, `../` to go up) for a track in the folder of the file or in a folder of the library, the path as the library has it for any other (or for one on another drive). See docs/app/playlist-export.md */
export const locationOf = (trackPath: string, folder: string, roots: string[] = []) => {
  const prefix = `${folder.replace(/\/+$/, '')}/`;
  if (trackPath.startsWith(prefix) && trackPath.length > prefix.length) return trackPath.slice(prefix.length);
  const relative = roots.some((root) => isInside(trackPath, root)) && driveOf(trackPath) === driveOf(folder);
  return relative ? path.posix.relative(folder, trackPath) : trackPath;
};

/** A location that is not relative is written as the system of the user has paths (with \\ on Windows), M3U and PLS only */
const writtenLocation = (trackPath: string, { folder, roots }: ExportPlaylist) => {
  const location = locationOf(trackPath, folder, roots);
  return location === trackPath && process.platform === 'win32' ? location.replace(/\//g, '\\') : location;
};

const seconds = (duration?: number) => (duration && duration > 0 ? Math.round(duration) : -1);

const displayName = ({ artist, title, path }: ExportEntry) => oneLine([artist, title ?? path.split('/').pop()].filter(Boolean).join(' - '));

const formatM3u = (playlist: ExportPlaylist) => {
  const { kept = nothingKept } = playlist;
  return [
    '#EXTM3U',
    `#PLAYLIST:${oneLine(playlist.name)}`,
    ...kept.header,
    ...playlist.entries.flatMap((entry) => {
      const location = oneLine(writtenLocation(entry.path, playlist));
      // a file can be named like a property that every object has
      const before = Object.hasOwn(kept.before, location) ? kept.before[location] : [];
      return [...before, `#EXTINF:${seconds(entry.duration)},${displayName(entry)}`, location];
    }),
    ...kept.tail,
  ].join('\n');
};

const formatPls = (playlist: ExportPlaylist) =>
  [
    '[playlist]',
    ...playlist.entries.flatMap((entry, index) => [
      `File${index + 1}=${oneLine(writtenLocation(entry.path, playlist))}`,
      `Title${index + 1}=${displayName(entry)}`,
      `Length${index + 1}=${seconds(entry.duration)}`,
    ]),
    `NumberOfEntries=${playlist.entries.length}`,
    'Version=2',
    ...(playlist.kept?.tail ?? []),
  ].join('\n');

const escapeXml = (text: string) =>
  oneLine(text)
    .replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const encodeSegments = (location: string) => location.split('/').map(encodeURIComponent).join('/');

const fileUri = (trackPath: string) => {
  const encoded = encodeSegments(trackPath);
  if (trackPath.startsWith('//')) return `file:${encoded}`;
  return trackPath.startsWith('/') ? `file://${encoded}` : `file:///${encoded.replace(/^([A-Za-z])%3A/, '$1:')}`;
};

/** A relative location is a relative reference, any other a `file:` URI (`file:///C:/Music/a.flac` for a path with a drive, `file://host/share/a.flac` for a share) */
const uriOf = (trackPath: string, folder: string, roots?: string[]) => {
  const location = locationOf(trackPath, folder, roots);
  return location === trackPath ? fileUri(trackPath) : encodeSegments(location);
};

const element = (tag: string, value: string | undefined) => (value ? [`      <${tag}>${escapeXml(value)}</${tag}>`] : []);

const formatXspf = ({ name, folder, roots, entries }: ExportPlaylist) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
    `  <title>${escapeXml(name)}</title>`,
    '  <trackList>',
    ...entries.flatMap((entry) => [
      '    <track>',
      `      <location>${escapeXml(uriOf(entry.path, folder, roots))}</location>`,
      ...element('title', entry.title),
      ...element('creator', entry.artist),
      ...element('album', entry.album),
      ...(entry.duration && entry.duration > 0 ? [`      <duration>${Math.round(entry.duration * 1000)}</duration>`] : []),
      '    </track>',
    ]),
    '  </trackList>',
    '</playlist>',
  ].join('\n');

const formatters: Record<PlaylistFormat, (playlist: ExportPlaylist) => string> = { m3u: formatM3u, pls: formatPls, xspf: formatXspf };

/** The text of the playlist file in the format */
export const formatPlaylist = (format: PlaylistFormat, playlist: ExportPlaylist) => `${formatters[format](playlist)}\n`;
