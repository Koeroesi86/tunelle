import { describe, expect, it } from 'vitest';
import isSupported, { isChromiumCodec, isDecodedCodec, isSupportedCodec } from './is-supported';

describe('isSupported', () => {
  it.each([
    'a.flac',
    'a.mp3',
    'a.mp2',
    'a.m4a',
    'a.ogg',
    'a.opus',
    'a.wav',
    'a.aac',
    'a.ape',
    'a.wv',
    'a.aiff',
    'a.aif',
    'a.aifc',
    'a.dsf',
    'a.dff',
    'a.wma',
    'a.asf',
    'C:/Music/b.flac',
  ])('accepts %s', (name) => {
    expect(isSupported(name)).toBe(true);
  });

  it.each(['a.wmv', 'a.m2a', 'a.m4p', 'a.mp4', 'a.m4v', 'a.3gp', 'a.ogv', 'a.ogx', 'a.txt', 'a'])('rejects %s, which the player cannot play', (name) => {
    expect(isSupported(name)).toBe(false);
  });
});

describe('isSupportedCodec', () => {
  it.each(['FLAC', 'MP3', 'MPEG-4/AAC', 'AAC', 'VORBIS', 'OPUS', 'WAV', 'ALAC', "MONKEY'S", 'WAVPACK', 'AIFF', 'AIFF-C', 'DSD', 'WMA', 'MP2', null, undefined])(
    'accepts %s',
    (codec) => {
      expect(isSupportedCodec(codec)).toBe(true);
    }
  );

  it.each(['SPEEX', 'THEORA', 'DSD-WAVPACK', 'DST', 'WMA-VOICE'])('rejects %s, which ffmpeg does not decode here', (codec) => {
    expect(isSupportedCodec(codec)).toBe(false);
  });
});

describe('isChromiumCodec', () => {
  it('names the decoded codecs that Chromium plays too, which the file falls back to', () => {
    expect(['MP3', 'FLAC', 'AC-3', null, undefined].map(isChromiumCodec)).toEqual([true, false, false, false, false]);
  });
});

describe('isDecodedCodec', () => {
  it('names the codecs that ffmpeg decodes before they are served', () => {
    expect(
      [
        'FLAC',
        'VORBIS',
        'ALAC',
        "MONKEY'S",
        'WAVPACK',
        'AIFF',
        'AIFF-C',
        'DSD',
        'WMA',
        'WAV',
        'IEEE_FLOAT',
        'ADPCM',
        'DVI_ADPCM',
        'ALAW',
        'MULAW',
        'MP3',
        'OPUS',
        'MP2',
        'AC-3',
      ].map(isDecodedCodec)
    ).toEqual(Array(19).fill(true));
    expect(['AAC', 'SPEEX', null, undefined].map(isDecodedCodec)).toEqual([false, false, false, false]);
  });
});
