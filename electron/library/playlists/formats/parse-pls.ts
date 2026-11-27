import type { ParsedEntry, ParsedPlaylist } from './playlist-types';

const keyPattern = /^(file|title|length)(\d+)\s*=(.*)$/is;

/** PLS: an INI file whose File1, Title1 and Length1 keys describe the entry 1; the numbers give the order, not the position in the file */
export const parsePls = (text: string): ParsedPlaylist => {
  const found = new Map<number, Partial<ParsedEntry>>();

  text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .forEach((line) => {
      const [, key, number, value] = keyPattern.exec(line.trim()) ?? [];
      if (!key || !number || value === undefined) return;

      const entry = found.get(Number(number)) ?? {};
      const kind = key.toLowerCase();
      if (kind === 'file') entry.location = value.trim();
      if (kind === 'title' && value.trim()) entry.title = value.trim();
      if (kind === 'length' && Number(value) > 0 && Number.isFinite(Number(value))) entry.duration = Number(value);
      found.set(Number(number), entry);
    });

  const entries = [...found.entries()]
    .sort(([first], [second]) => first - second)
    .flatMap(([, entry]) => (entry.location ? [{ ...entry, location: entry.location }] : []));

  return { entries };
};
