import { describe, expect, it } from 'vitest';
import { unusualNames } from '../../../../shared/test-unusual-names';
import { keptLinesOf } from '../files/kept-lines';
import { resolveLocation } from '../files/resolve-location';
import { formatPlaylist } from './format-playlist';
import { parsePlaylist } from './parse-playlist';

const folder = '/music/#lists 100%';
const places = [
  { place: 'beside the file', pathOf: (name: string) => `${folder}/${name}.flac` },
  { place: 'below its folder', pathOf: (name: string) => `${folder}/${name}/${name}.flac` },
  { place: 'up from it, in the library', pathOf: (name: string) => `/music/${name}/${name}.flac` },
  { place: 'outside the library', pathOf: (name: string) => `/other/${name}.flac` },
];

describe.each(['m3u', 'pls', 'xspf'] as const)('a %s file with unusual names', (format) => {
  const read = (text: string) => parsePlaylist(format, text).entries.map(({ location }) => resolveLocation(location, folder));

  it.each(unusualNames)('leads back to a file with $kind', ({ name }) => {
    const entries = places.map(({ pathOf }) => ({ path: pathOf(name) }));

    const text = formatPlaylist(format, { name, folder, roots: ['/music'], entries });

    expect(read(text)).toEqual(entries.map(({ path }) => ({ kind: 'file', path })));
  });
});

describe('an M3U file with a name that starts like a comment', () => {
  const entries = [{ path: `${folder}/#1.flac` }];
  const playlist = { name: 'Mix', folder, entries };

  it('keeps the comment before it when it is written again', () => {
    const written = formatPlaylist('m3u', playlist).replace('#EXTINF', '#mine\n#EXTINF');

    expect(formatPlaylist('m3u', { ...playlist, kept: keptLinesOf('m3u', written) })).toBe(written);
  });
});
