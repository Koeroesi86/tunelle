import { describe, expect, it } from 'vitest';
import { decodePlaylist, guessLegacyEncoding } from './decode-playlist';

describe('decodePlaylist with an encoding that was chosen', () => {
  const bytes = Buffer.from([0xe9, 0x2e, 0x66]);

  it('reads the bytes with it instead of what is detected', () => {
    expect(decodePlaylist(bytes, 'windows-1251')).toEqual({ text: 'й.f', encoding: 'windows-1251' });
    expect(decodePlaylist(Buffer.from('é.f'), 'windows-1252')).toEqual({ text: 'Ã©.f', encoding: 'windows-1252' });
  });

  it('detects the encoding for none, for a null and for one that is not offered', () => {
    const detected = decodePlaylist(bytes).encoding;

    expect(decodePlaylist(bytes, null).encoding).toBe(detected);
    expect(decodePlaylist(bytes, 'klingon').encoding).toBe(detected);
  });
});

describe('decodePlaylist', () => {
  it('reads UTF-8, with or without the byte order mark', () => {
    expect(decodePlaylist(Buffer.from('\uFEFFÁrvíz.flac'))).toEqual({ text: 'Árvíz.flac', encoding: 'utf-8' });
    expect(decodePlaylist(Buffer.from('Árvíz.flac'))).toEqual({ text: 'Árvíz.flac', encoding: 'utf-8' });
  });

  it('reads UTF-16 by its byte order mark', () => {
    expect(decodePlaylist(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('a.flac', 'utf16le')]))).toEqual({ text: 'a.flac', encoding: 'utf-16le' });
  });

  it('reads bytes that are not UTF-8 as the legacy encoding of the system', () => {
    const { text, encoding } = decodePlaylist(Buffer.from([0x63, 0x61, 0x66, 0xe9]));

    expect(encoding).toBe(guessLegacyEncoding());
    expect(text).toHaveLength(4);
  });
});

describe('guessLegacyEncoding', () => {
  it.each([
    ['ru-RU', 'win32', 'windows-1251'],
    ['hu-HU', 'win32', 'windows-1250'],
    ['el', 'linux', 'windows-1253'],
    ['ja-JP', 'darwin', 'shift_jis'],
    ['en-US', 'darwin', 'macintosh'],
    ['en-US', 'win32', 'windows-1252'],
    ['de-DE', 'linux', 'windows-1252'],
  ])('takes the code page of %s on %s: %s', (language, platform, expected) => {
    expect(guessLegacyEncoding(language, platform as NodeJS.Platform)).toBe(expected);
  });

  it('reads a Windows 1250 and a Mac Roman file name as the characters they were written with', () => {
    expect(new TextDecoder('windows-1250').decode(Buffer.from([0xe1, 0xf5]))).toBe('áő');
    expect(new TextDecoder('macintosh').decode(Buffer.from([0x8e]))).toBe('é');
  });
});
