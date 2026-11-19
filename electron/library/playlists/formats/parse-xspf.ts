import type { ParsedEntry, ParsedPlaylist } from './playlist-types';

const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return namedEntities[entity] ?? match;

    const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });

const textOf = (value: string) => decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, cdata: string) => cdata.replace(/&/g, '&amp;'))).trim();

/** The text of the first element of that name in the markup, undefined when it is not there or is empty */
const childText = (markup: string, name: string) => {
  const found = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(markup)?.[1];
  return found === undefined ? undefined : textOf(found) || undefined;
};

const toEntry = (markup: string): ParsedEntry[] => {
  const location = childText(markup, 'location');
  const milliseconds = Number(childText(markup, 'duration'));
  const duration = milliseconds > 0 ? milliseconds / 1000 : undefined;

  return location ? [{ location, title: childText(markup, 'title'), artist: childText(markup, 'creator'), album: childText(markup, 'album'), duration }] : [];
};

/** Comments, the start of the track list and the tracks, found in one pass, so a comment is skipped as a whole and nothing is cut out of the text */
const tokenPattern = /<!--[\s\S]*?-->|<trackList[\s>]|<track(?:\s[^>]*)?>([\s\S]*?)<\/track>/gi;

/** XSPF: the title of the playlist is the one before the track list, a track is a `track` element with its `location` (a URI), `title`, `creator`, `album` and `duration` in milliseconds */
export const parseXspf = (text: string): ParsedPlaylist => {
  const tokens = [...text.matchAll(tokenPattern)];
  const trackListAt = tokens.find(([token]) => token.toLowerCase().startsWith('<tracklist'))?.index ?? text.length;

  return { title: childText(text.slice(0, trackListAt), 'title'), entries: tokens.flatMap(([, markup]) => (markup === undefined ? [] : toEntry(markup))) };
};
