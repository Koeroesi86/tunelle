import type { ParsedEntry, ParsedPlaylist } from './playlist-types';

const extinfPattern = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)\s*(?:[^,]*)?,(.*)$/i;

/** "Artist - Title" as the extended M3U puts them in one text; a text without the separator is the title */
const splitDisplayName = (text: string): Pick<ParsedEntry, 'artist' | 'title'> => {
  const [artist, ...rest] = text.split(' - ');
  return rest.length > 0 ? { artist: artist?.trim(), title: rest.join(' - ').trim() } : { title: text.trim() };
};

const readInfo = (line: string): Partial<ParsedEntry> | undefined => {
  const [, seconds, text] = extinfPattern.exec(line) ?? [];
  if (text === undefined) return undefined;

  const duration = Number(seconds);
  return { ...(text.trim() ? splitDisplayName(text) : {}), ...(duration > 0 ? { duration } : {}) };
};

/** M3U and M3U8: a line is a location, a line that starts with # is a comment or an extended directive for the location after it */
export const parseM3u = (text: string): ParsedPlaylist => {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const title = lines.map((line) => /^#PLAYLIST:(.*)$/i.exec(line.trim())?.[1]?.trim()).find((value) => value);
  const entries: ParsedEntry[] = [];
  let info: Partial<ParsedEntry> | undefined;

  lines.forEach((raw) => {
    const line = raw.trim();
    if (line.startsWith('#')) {
      info = readInfo(line) ?? info;
      return;
    }
    if (!line) return;

    entries.push({ location: line, ...info });
    info = undefined;
  });

  return { title, entries };
};
