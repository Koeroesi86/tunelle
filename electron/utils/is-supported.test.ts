import { describe, expect, it } from 'vitest';
import isSupported, { isDecodedCodec, isSupportedCodec } from './is-supported';

describe('isSupported', () => {
  it.each(['a.flac', 'a.mp3', 'a.m4a', 'a.ogg', 'a.opus', 'a.wav', 'a.aac', 'a.ape', 'a.wv', 'a.aiff', 'a.aif', 'a.aifc', 'C:/Music/b.flac'])(
    'accepts %s',
    (name) => {
      expect(isSupported(name)).toBe(true);
    }
  );

  it.each(['a.wma', 'a.mp2', 'a.asf', 'a.m4p', 'a.mp4', 'a.m4v', 'a.3gp', 'a.ogv', 'a.ogx', 'a.txt', 'a'])(
    'rejects %s, which the player cannot play',
    (name) => {
      expect(isSupported(name)).toBe(false);
    }
  );
});

describe('isSupportedCodec', () => {
  it.each(['FLAC', 'MP3', 'MPEG-4/AAC', 'AAC', 'VORBIS', 'OPUS', 'WAV', 'ALAC', "MONKEY'S", 'WAVPACK', 'AIFF', 'AIFF-C', null, undefined])(
    'accepts %s',
    (codec) => {
      expect(isSupportedCodec(codec)).toBe(true);
    }
  );

  it.each(['AC-3', 'SPEEX', 'THEORA', 'DSD'])('rejects %s, which Chromium does not decode', (codec) => {
    expect(isSupportedCodec(codec)).toBe(false);
  });
});

describe('isDecodedCodec', () => {
  it('names the codecs that ffmpeg decodes before they are served', () => {
    expect(['ALAC', "MONKEY'S", 'WAVPACK', 'AIFF', 'AIFF-C'].map(isDecodedCodec)).toEqual([true, true, true, true, true]);
    expect(['FLAC', 'AC-3', null, undefined].map(isDecodedCodec)).toEqual([false, false, false, false]);
  });
});
