import path from 'path';
import type { MessageKey } from '@shared/locales/translate';

export type PlaylistFormat = 'm3u' | 'pls' | 'xspf';

const formatOfExtension: Record<string, PlaylistFormat> = { '.m3u': 'm3u', '.m3u8': 'm3u', '.pls': 'pls', '.xspf': 'xspf' };

/** The format of a playlist file by its extension, undefined for any other file. See docs/app/playlist-import.md */
export const playlistFormatOf = (filePath: string): PlaylistFormat | undefined => formatOfExtension[path.extname(filePath).toLowerCase()];

export const isPlaylistFile = (filePath: string) => playlistFormatOf(filePath) !== undefined;

/** The extensions of the open dialog, without the dot */
export const playlistExtensions = Object.keys(formatOfExtension).map((extension) => extension.slice(1));

/** The formats of the save dialog, the first is the one a new file gets */
export const playlistExportFilters: { key: MessageKey; extensions: string[] }[] = [
  { key: 'playlists.exportM3u8', extensions: ['m3u8'] },
  { key: 'playlists.exportM3u', extensions: ['m3u'] },
  { key: 'playlists.exportPls', extensions: ['pls'] },
  { key: 'playlists.exportXspf', extensions: ['xspf'] },
];
