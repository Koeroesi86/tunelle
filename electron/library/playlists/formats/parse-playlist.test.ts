import { describe, expect, it } from 'vitest';
import { parsePlaylist } from './parse-playlist';

describe('parsePlaylist', () => {
  it('reads an extended M3U with the info before each location, and the name', () => {
    const text =
      '\uFEFF#EXTM3U\r\n#PLAYLIST:Late night\r\n#EXTINF:215,Some Band - First - Part\r\nmusic/one.flac\r\n\r\n#EXTINF:-1,Only title\r\n/abs/two.mp3\r\nthree.ogg\r\n';

    expect(parsePlaylist('m3u', text)).toEqual({
      title: 'Late night',
      entries: [
        { location: 'music/one.flac', artist: 'Some Band', title: 'First - Part', duration: 215 },
        { location: '/abs/two.mp3', title: 'Only title' },
        { location: 'three.ogg' },
      ],
    });
  });

  it('reads PLS in the order of the numbers, whatever the case of the keys', () => {
    const text = '[playlist]\nTitle2=Second\nfile2=b.flac\nFILE1=a.flac\nLength1=120\nNumberOfEntries=2\nTitle9=No file\n';

    expect(parsePlaylist('pls', text).entries).toEqual([
      { location: 'a.flac', duration: 120 },
      { location: 'b.flac', title: 'Second' },
    ]);
  });

  it('reads XSPF: URIs, entities, CDATA and the milliseconds, with the title of the playlist and not of a track', () => {
    const text = `<?xml version="1.0"?><playlist version="1" xmlns="http://xspf.org/ns/0/"><title>Mix &amp; match</title>
      <trackList>
        <track><location>file:///home/me/Music/a%20b.flac</location><title><![CDATA[A & B]]></title><creator>Band</creator><album>Rec</album><duration>61500</duration></track>
        <!-- <track><location>skipped.flac</location></track> -->
        <track><location>http://radio.example/stream</location></track>
        <track><title>No location</title></track>
      </trackList></playlist>`;

    expect(parsePlaylist('xspf', text)).toEqual({
      title: 'Mix & match',
      entries: [
        { location: 'file:///home/me/Music/a%20b.flac', title: 'A & B', artist: 'Band', album: 'Rec', duration: 61.5 },
        { location: 'http://radio.example/stream' },
      ],
    });
  });

  it.each([
    ['a decimal number', '&#233;', '\u00e9'],
    ['a hexadecimal number', '&#xE9;', '\u00e9'],
    ['a character past the first plane', '&#x1F3B5;', '\ud83c\udfb5'],
    ['the number 0, which is no character', '&#0;', '&#0;'],
    ['a number past the last character', '&#x110000;', '&#x110000;'],
    ['a name that XML does not have', '&nbsp;', '&nbsp;'],
  ])('reads %s in a title of XSPF', (_, written, title) => {
    const text = `<trackList><track><location>a.flac</location><title>${written}</title></track></trackList>`;

    expect(parsePlaylist('xspf', text).entries).toEqual([{ location: 'a.flac', title }]);
  });

  it('skips a comment as a whole, also one that holds the markup of a track list', () => {
    const text =
      '<playlist><!-- <trackList><track><location>x.flac</location></track> --><title>T</title><trackList><track><location>a.flac</location></track></trackList></playlist>';

    expect(parsePlaylist('xspf', text)).toEqual({ title: 'T', entries: [{ location: 'a.flac' }] });
  });

  it.each([
    ['m3u', `#EXTINF:${'9'.repeat(400)},One\u2028Two\na.flac`, { title: 'One\u2028Two' }],
    ['pls', 'File1=a.flac\nLength1=Infinity\nTitle1=One\u2028Two', { title: 'One\u2028Two' }],
    ['xspf', '<track><location>a.flac</location><title>&constructor;</title><duration>1e400</duration></track>', { title: '&constructor;' }],
  ] as const)('keeps the text of a %s entry as it is, without a length that is not a number', (format, text, expected) => {
    expect(parsePlaylist(format, text).entries).toEqual([expect.objectContaining({ location: 'a.flac', ...expected })]);
    expect(parsePlaylist(format, text).entries[0].duration).toBeUndefined();
  });
});
