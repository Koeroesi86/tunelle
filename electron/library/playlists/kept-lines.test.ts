import { describe, expect, it } from 'vitest';
import { keptLinesOf } from './kept-lines';

describe('keptLinesOf', () => {
  it('keeps the comments of an M3U that the app does not write, by where they were', () => {
    const text =
      '\uFEFF#EXTM3U\r\n#PLAYLIST:Mix\r\n#EXTGRP:rock\r\n#EXTINF:10,A - B\r\none.flac\r\n\r\n#EXTALB:Rec\r\n# a note\r\n#EXTINF:5,C\r\ntwo.flac\r\n# the end\r\n';

    expect(keptLinesOf('m3u', text)).toEqual({
      header: ['#EXTGRP:rock'],
      before: { 'two.flac': ['#EXTALB:Rec', '# a note'] },
      tail: ['# the end'],
    });
  });

  it('keeps nothing of an M3U that has only what the app writes, or of a file that has no location', () => {
    expect(keptLinesOf('m3u', '#EXTM3U\n#EXTINF:1,A\na.flac\n')).toEqual({ header: [], before: {}, tail: [] });
    expect(keptLinesOf('m3u', '# only a comment\n')).toEqual({ header: [], before: {}, tail: ['# only a comment'] });
  });

  it('keeps the keys and the sections of a PLS that the app does not write', () => {
    const text = '[playlist]\nFile1=a.flac\nTitle1=A\nLength1=3\nNumberOfEntries=1\nVersion=2\n[extra]\nColor=red\n';

    expect(keptLinesOf('pls', text).tail).toEqual(['[extra]', 'Color=red']);
  });

  it('keeps nothing of an XSPF', () => {
    expect(keptLinesOf('xspf', '<playlist><annotation>x</annotation></playlist>')).toEqual({ header: [], before: {}, tail: [] });
  });
});
