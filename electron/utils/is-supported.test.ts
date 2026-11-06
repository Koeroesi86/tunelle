import { describe, expect, it } from 'vitest';
import isSupported, { isSupportedCodec } from './is-supported';

describe('isSupported', () => {
  it.each(['a.flac', 'a.mp3', 'a.m4a', 'a.ogg', 'a.opus', 'a.wav', 'a.aac', 'C:/Music/b.flac'])('accepts %s', (name) => {
    expect(isSupported(name)).toBe(true);
  });

  it.each(['a.ape', 'a.wma', 'a.aiff', 'a.wv', 'a.mp2', 'a.asf', 'a.m4p', 'a.mp4', 'a.m4v', 'a.3gp', 'a.ogv', 'a.ogx', 'a.txt', 'a'])(
    'rejects %s, which the player cannot play',
    (name) => {
      expect(isSupported(name)).toBe(false);
    }
  );
});

describe('isSupportedCodec', () => {
  it.each(['FLAC', 'MP3', 'MPEG-4/AAC', 'AAC', 'VORBIS', 'OPUS', 'WAV', null, undefined])('accepts %s', (codec) => {
    expect(isSupportedCodec(codec)).toBe(true);
  });

  it.each(['ALAC', 'AC-3', 'SPEEX', 'THEORA'])('rejects %s, which Chromium does not decode', (codec) => {
    expect(isSupportedCodec(codec)).toBe(false);
  });
});
