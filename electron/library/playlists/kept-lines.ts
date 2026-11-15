import type { PlaylistFormat } from './playlist-files';

/** What an earlier file had that the app does not write itself: lines of the head, lines before a location, and lines at the end */
export interface KeptLines {
  header: string[];
  before: Record<string, string[]>;
  tail: string[];
}

export const nothingKept: KeptLines = { header: [], before: {}, tail: [] };

const knownM3u = /^#(EXTM3U|PLAYLIST:|EXTINF:)/i;
const knownPls = /^(\[playlist\]|(File|Title|Length)\d+=|NumberOfEntries=|Version=)/i;

const linesOf = (text: string) =>
  text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const keptOfM3u = (text: string): KeptLines & { pending: string[] } =>
  linesOf(text).reduce<KeptLines & { pending: string[]; located: boolean }>(
    (kept, line) => {
      if (line.startsWith('#')) return knownM3u.test(line) ? kept : { ...kept, pending: [...kept.pending, line] };
      if (kept.pending.length === 0) return { ...kept, located: true };
      // what comes before the first location describes the file, what comes before another one describes that track
      return kept.located
        ? { ...kept, before: { ...kept.before, [line]: kept.pending }, pending: [] }
        : { ...kept, header: kept.pending, pending: [], located: true };
    },
    { ...nothingKept, pending: [], located: false }
  );

/** The lines of an earlier playlist file that are kept when it is written again, where the format allows: M3U comments other than the ones the app writes (those of the head of the file stay in the head, those before a location stay before it), the other keys and sections of a PLS. XSPF has none: its elements are the ones the app writes. See docs/app/playlist-export.md */
export const keptLinesOf = (format: PlaylistFormat, text: string): KeptLines => {
  if (format === 'pls') return { ...nothingKept, tail: linesOf(text).filter((line) => !knownPls.test(line)) };
  if (format === 'xspf') return nothingKept;
  const { header, before, pending } = keptOfM3u(text);
  return { header, before, tail: pending };
};
