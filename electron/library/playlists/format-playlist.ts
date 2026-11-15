import type { PlaylistFormat } from './playlist-files';

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
}

/** A line of a playlist file holds one value, so a line break in a title is a space */
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

/** The path as it is written: relative to the folder of the file (with /) for a track inside it, the path as the library has it for any other. See docs/app/playlist-export.md */
export const locationOf = (trackPath: string, folder: string) => {
  const prefix = `${folder.replace(/\/+$/, '')}/`;
  return trackPath.startsWith(prefix) && trackPath.length > prefix.length ? trackPath.slice(prefix.length) : trackPath;
};

const seconds = (duration?: number) => (duration && duration > 0 ? Math.round(duration) : -1);

const displayName = ({ artist, title, path }: ExportEntry) => oneLine([artist, title ?? path.split('/').pop()].filter(Boolean).join(' - '));

const formatM3u = ({ name, folder, entries }: ExportPlaylist) =>
  [
    '#EXTM3U',
    `#PLAYLIST:${oneLine(name)}`,
    ...entries.flatMap((entry) => [`#EXTINF:${seconds(entry.duration)},${displayName(entry)}`, oneLine(locationOf(entry.path, folder))]),
  ].join('\n');

const formatPls = ({ folder, entries }: ExportPlaylist) =>
  [
    '[playlist]',
    ...entries.flatMap((entry, index) => [
      `File${index + 1}=${oneLine(locationOf(entry.path, folder))}`,
      `Title${index + 1}=${displayName(entry)}`,
      `Length${index + 1}=${seconds(entry.duration)}`,
    ]),
    `NumberOfEntries=${entries.length}`,
    'Version=2',
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
const uriOf = (trackPath: string, folder: string) => {
  const location = locationOf(trackPath, folder);
  return location === trackPath ? fileUri(trackPath) : encodeSegments(location);
};

const element = (tag: string, value: string | undefined) => (value ? [`      <${tag}>${escapeXml(value)}</${tag}>`] : []);

const formatXspf = ({ name, folder, entries }: ExportPlaylist) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
    `  <title>${escapeXml(name)}</title>`,
    '  <trackList>',
    ...entries.flatMap((entry) => [
      '    <track>',
      `      <location>${escapeXml(uriOf(entry.path, folder))}</location>`,
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
