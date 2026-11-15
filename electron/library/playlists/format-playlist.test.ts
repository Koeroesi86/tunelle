import { describe, expect, it } from 'vitest';
import { formatPlaylist, locationOf } from './format-playlist';
import { parsePlaylist } from './parse-playlist';

const playlist = {
  name: 'Road',
  folder: '/music/lists',
  entries: [
    { path: '/music/lists/a & b/one.flac', title: 'One <1>', artist: 'Band', album: 'Rec', duration: 200.4 },
    { path: '/other/two é.flac', title: 'Two' },
  ],
};

describe('locationOf', () => {
  it('is relative inside the folder and the path as it is elsewhere', () => {
    expect(locationOf('/music/lists/a/one.flac', '/music/lists')).toBe('a/one.flac');
    expect(locationOf('/music/lists/a/one.flac', '/music/lists/')).toBe('a/one.flac');
    expect(locationOf('/music/listsx/one.flac', '/music/lists')).toBe('/music/listsx/one.flac');
    expect(locationOf('D:/m/one.flac', 'C:/m')).toBe('D:/m/one.flac');
  });
});

describe('formatPlaylist', () => {
  it('writes an extended M3U that reads back the same', () => {
    const text = formatPlaylist('m3u', playlist);

    expect(text).toContain('#EXTINF:200,Band - One <1>\na & b/one.flac\n');
    expect(parsePlaylist('m3u', text)).toEqual({
      title: 'Road',
      entries: [
        { location: 'a & b/one.flac', artist: 'Band', title: 'One <1>', duration: 200 },
        { location: '/other/two é.flac', title: 'Two' },
      ],
    });
  });

  it('writes a PLS that reads back the same', () => {
    const text = formatPlaylist('pls', playlist);

    expect(text).toContain('NumberOfEntries=2');
    expect(parsePlaylist('pls', text).entries.map(({ location }) => location)).toEqual(['a & b/one.flac', '/other/two é.flac']);
  });

  it('writes an XSPF with escaped text and URIs that read back the same', () => {
    const text = formatPlaylist('xspf', playlist);

    expect(text).toContain('<title>One &lt;1&gt;</title>');
    expect(text).toContain('<location>a%20%26%20b/one.flac</location>');
    expect(text).toContain('<location>file:///other/two%20%C3%A9.flac</location>');
    expect(parsePlaylist('xspf', text).entries[0]).toMatchObject({ title: 'One <1>', artist: 'Band', album: 'Rec', duration: 200.4 });
  });

  it('writes a drive path and a share as file URIs', () => {
    const text = formatPlaylist('xspf', { name: 'n', folder: 'C:/lists', entries: [{ path: 'D:/m/a.flac' }, { path: '//host/share/b.flac' }] });

    expect(text).toContain('<location>file:///D:/m/a.flac</location>');
    expect(text).toContain('<location>file://host/share/b.flac</location>');
  });

  it('keeps a line break out of a line', () => {
    expect(formatPlaylist('m3u', { name: 'a\nb', folder: '/', entries: [] })).toContain('#PLAYLIST:a b\n');
  });
});
