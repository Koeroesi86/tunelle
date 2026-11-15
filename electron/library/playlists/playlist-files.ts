import path from 'path';

export type PlaylistFormat = 'm3u' | 'pls' | 'xspf';

const formatOfExtension: Record<string, PlaylistFormat> = { '.m3u': 'm3u', '.m3u8': 'm3u', '.pls': 'pls', '.xspf': 'xspf' };

/** The format of a playlist file by its extension, undefined for any other file. See docs/app/playlist-import.md */
export const playlistFormatOf = (filePath: string): PlaylistFormat | undefined => formatOfExtension[path.extname(filePath).toLowerCase()];

export const isPlaylistFile = (filePath: string) => playlistFormatOf(filePath) !== undefined;

/** The extensions of the open dialog, without the dot */
export const playlistExtensions = Object.keys(formatOfExtension).map((extension) => extension.slice(1));
