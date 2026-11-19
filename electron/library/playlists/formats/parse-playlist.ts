import { parseM3u } from './parse-m3u';
import { parsePls } from './parse-pls';
import { parseXspf } from './parse-xspf';
import type { PlaylistFormat } from '../files/playlist-files';
import type { ParsedPlaylist } from './playlist-types';

const parsers: Record<PlaylistFormat, (text: string) => ParsedPlaylist> = { m3u: parseM3u, pls: parsePls, xspf: parseXspf };

export const parsePlaylist = (format: PlaylistFormat, text: string) => parsers[format](text);
