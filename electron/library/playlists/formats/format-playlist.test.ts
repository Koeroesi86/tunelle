import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPlaylist, isOnAnotherDrive, locationOf } from './format-playlist';
import { parsePlaylist } from './parse-playlist';

const playlist = {
  name: 'Road',
  folder: '/music/lists',
  entries: [
    { path: '/music/lists/a & b/one.flac', title: 'One <1>', artist: 'Band', album: 'Rec', duration: 200.4 },
    { path: '/other/two é.flac', title: 'Two' },
  ],
};

describe('formatPlaylist with a file name', () => {
  it('writes a file that is named like a property of every object', () => {
    const text = formatPlaylist('m3u', { name: 'A list', folder: '/music', entries: [{ path: '/music/constructor' }] });

    expect(parsePlaylist('m3u', text).entries.map(({ location }) => location)).toEqual(['constructor']);
  });
});

describe('locationOf', () => {
  it('is relative inside the folder and the path as it is elsewhere', () => {
    expect(locationOf('/music/lists/a/one.flac', '/music/lists')).toBe('a/one.flac');
    expect(locationOf('/music/lists/a/one.flac', '/music/lists/')).toBe('a/one.flac');
    expect(locationOf('/music/listsx/one.flac', '/music/lists')).toBe('/music/listsx/one.flac');
    expect(locationOf('D:/m/one.flac', 'C:/m')).toBe('D:/m/one.flac');
  });
});

describe('locationOf for the folders of the library', () => {
  const roots = ['/music', 'C:/music'];

  it('goes up from the folder of the file to a sibling or a parent folder', () => {
    expect(locationOf('/music/a/one.flac', '/music/lists', roots)).toBe('../a/one.flac');
    expect(locationOf('/music/one.flac', '/music/lists/deep', roots)).toBe('../../one.flac');
  });

  it('writes the full path of a track that is in no folder of the library, or on another drive', () => {
    expect(locationOf('/elsewhere/one.flac', '/music/lists', roots)).toBe('/elsewhere/one.flac');
    expect(locationOf('C:/music/one.flac', 'D:/lists', roots)).toBe('C:/music/one.flac');
    expect(locationOf('//host/share/music/one.flac', '//other/share', ['//host/share/music'])).toBe('//host/share/music/one.flac');
  });

  it('tells a track that cannot be written relative from one that is just not in the library', () => {
    expect(isOnAnotherDrive('C:/music/one.flac', 'D:/lists', roots)).toBe(true);
    expect(isOnAnotherDrive('E:/other/one.flac', 'D:/lists', roots)).toBe(false);
    expect(isOnAnotherDrive('C:/music/one.flac', 'c:/lists', roots)).toBe(false);
    expect(isOnAnotherDrive('/music/one.flac', '/lists')).toBe(false);
  });
});

describe('formatPlaylist, the way the paths are written', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['m3u', 'pls'] as const)('writes an absolute path of a %s the way Windows has it there, and not elsewhere', (format) => {
    const entries = [{ path: 'D:/m/a.flac' }, { path: 'C:/lists/b.flac' }];
    const onWindows = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    expect(formatPlaylist(format, { name: 'n', folder: 'C:/lists', entries })).toContain('D:\\m\\a.flac');
    expect(formatPlaylist(format, { name: 'n', folder: 'C:/lists', entries })).toContain('b.flac');
    expect(formatPlaylist(format, { name: 'n', folder: 'C:/lists', entries })).not.toContain('C:\\lists');

    onWindows.mockReturnValue('linux');
    expect(formatPlaylist(format, { name: 'n', folder: 'C:/lists', entries })).toContain('D:/m/a.flac');
    onWindows.mockRestore();
  });

  it('writes an XSPF location as a URI also on Windows, and a relative one that goes up', () => {
    const text = formatPlaylist('xspf', {
      name: 'n',
      folder: '/music/lists',
      roots: ['/music'],
      entries: [{ path: '/music/a b.flac' }, { path: '/x/y.flac' }],
    });

    expect(text).toContain('<location>../a%20b.flac</location>');
    expect(text).toContain('<location>file:///x/y.flac</location>');
  });
});

describe('formatPlaylist with the lines of the earlier file', () => {
  const kept = { header: ['#EXTGRP:rock'], before: { 'one.flac': ['#EXTALB:Rec'] }, tail: ['# end'] };

  it('writes the kept lines of an M3U at the head, before the location they were before, and at the end', () => {
    const text = formatPlaylist('m3u', { name: 'n', folder: '/m', kept, entries: [{ path: '/m/two.flac' }, { path: '/m/one.flac' }] });

    expect(text).toBe('#EXTM3U\n#PLAYLIST:n\n#EXTGRP:rock\n#EXTINF:-1,two.flac\ntwo.flac\n#EXTALB:Rec\n#EXTINF:-1,one.flac\none.flac\n# end\n');
  });

  it('drops the lines that were before a location that is no longer in the playlist', () => {
    expect(formatPlaylist('m3u', { name: 'n', folder: '/m', kept, entries: [] })).not.toContain('#EXTALB');
  });

  it('writes the kept lines of a PLS at the end', () => {
    const text = formatPlaylist('pls', { name: 'n', folder: '/m', kept: { header: [], before: {}, tail: ['[other]', 'Key=1'] }, entries: [] });

    expect(text.endsWith('Version=2\n[other]\nKey=1\n')).toBe(true);
  });
});

describe('formatPlaylist', () => {
  // the absolute path is written the way the system has it, so the round trip is checked as on Linux
  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  });
  afterEach(() => vi.restoreAllMocks());

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

  it('leaves out the characters that XML cannot hold, and keeps the ones it can', () => {
    const text = formatPlaylist('xspf', { name: 'a\u0000b\u0008c\uFFFEd', folder: '/m', entries: [{ path: '/m/a.flac', title: 'Caf\u00e9 \u{1F3B5}\u000B' }] });

    expect(text).toContain('<title>abcd</title>');
    expect(text).toContain('<title>Caf\u00e9 \u{1F3B5}</title>');
  });

  it('names a track without a title by its file, and with its artist first', () => {
    const text = formatPlaylist('m3u', { name: 'n', folder: '/m', entries: [{ path: '/m/sub/a one.flac' }, { path: '/m/b.flac', artist: 'Band' }] });

    expect(text).toContain('#EXTINF:-1,a one.flac\nsub/a one.flac\n');
    expect(text).toContain('#EXTINF:-1,Band - b.flac\nb.flac\n');
  });

  it('writes the length as -1 when a track has none, and a title of a PLS on one line', () => {
    const text = formatPlaylist('pls', { name: 'n', folder: '/m', entries: [{ path: '/m/a.flac', title: 'one\ntwo' }] });

    expect(text).toContain('Title1=one two\nLength1=-1\n');
  });

  it('writes the playlist without entries as a file that reads back empty', () => {
    expect.assertions(3);
    (['m3u', 'pls', 'xspf'] as const).forEach((format) =>
      expect(parsePlaylist(format, formatPlaylist(format, { name: 'n', folder: '/m', entries: [] })).entries).toEqual([])
    );
  });
});
