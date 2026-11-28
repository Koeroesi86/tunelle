import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { propertyParameters } from '../../../../shared/test-properties';
import { formatPlaylist } from './format-playlist';
import { parsePlaylist } from './parse-playlist';
import type { PlaylistFormat } from '../files/playlist-files';

const formats: PlaylistFormat[] = ['m3u', 'pls', 'xspf'];

/** The pieces that the three formats are made of, and the values that a number or a name goes wrong with */
const piece = fc.constantFrom(
  '#EXTM3U',
  '#EXTINF:',
  '#PLAYLIST:',
  'File',
  'Title',
  'Length',
  '=',
  ',',
  ' - ',
  '\n',
  '\r',
  ' ',
  '-1',
  '0',
  '1',
  '9'.repeat(400),
  'Infinity',
  '1e400',
  'a.flac',
  '<playlist>',
  '<trackList>',
  '</trackList>',
  '<track>',
  '</track>',
  '<location>',
  '</location>',
  '<title>',
  '</title>',
  '<duration>',
  '</duration>',
  '<!--',
  '-->',
  '<![CDATA[',
  ']]>',
  '&',
  '#x',
  ';',
  'amp',
  'constructor',
  '__proto__'
);

const text = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.array(fc.oneof(piece, fc.string({ maxLength: 5 })), { maxLength: 60 }).map((parts) => parts.join(''))
);

/** A track element and a line of each of the other formats, so that most texts have entries */
const entries = fc
  .array(fc.tuple(text, text, text), { maxLength: 5 })
  .map((all) =>
    all
      .map(
        ([location, name, length]) =>
          `#EXTINF:${length},${name}\n${location}\nFile1=${location}\nLength1=${length}\n<track><location>${location}</location><title>${name}</title><duration>${length}</duration></track>`
      )
      .join('\n')
  );

describe('parsePlaylist with untrusted text', () => {
  it.each(formats)('reads any text as %s: each entry has a location, and a length that is a number or none', (format) =>
    fc.assert(
      fc.property(fc.oneof(text, entries), (content) => {
        parsePlaylist(format, content).entries.forEach((entry) => {
          expect(entry.location).not.toBe('');
          expect(entry.duration === undefined || (Number.isFinite(entry.duration) && entry.duration > 0)).toBe(true);
        });
      }),
      propertyParameters
    )
  );

  it('leaves an entity of XSPF that it does not know as it is', () =>
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom('constructor', 'toString', 'valueOf', 'hasOwnProperty'), fc.stringMatching(/^[A-Za-z]{1,12}$/)), (name) => {
        fc.pre(!['amp', 'lt', 'gt', 'quot', 'apos'].includes(name));
        const found = parsePlaylist('xspf', `<track><location>a&${name};b</location></track>`);

        expect(found.entries[0].location).toBe(`a&${name};b`);
      }),
      propertyParameters
    ));

  /** A file name that a line of a playlist can hold as it is: not the start of a comment, and no space around it */
  const fileName = fc
    .string({ unit: 'grapheme', minLength: 1, maxLength: 30 })
    .filter((name) => /^[^/\\\r\n\0#][^/\\\r\n\0]*$/.test(name) && name === name.trim() && !['.', '..'].includes(name));

  it.each(formats)('reads the locations of the %s file that the app writes', (format) =>
    fc.assert(
      fc.property(fc.array(fileName, { maxLength: 8 }), (names) => {
        const written = formatPlaylist(format, { name: 'A list', folder: '/music', entries: names.map((name) => ({ path: `/music/${name}` })) });
        const read = parsePlaylist(format, written).entries.map(({ location }) => location);

        expect(read).toEqual(names);
      }),
      propertyParameters
    )
  );
});
