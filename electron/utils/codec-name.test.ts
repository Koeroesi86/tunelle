import { describe, expect, it } from 'vitest';
import { isAmbiguousContainer, toCodecName } from './codec-name';

describe('toCodecName', () => {
  it.each([
    ['flac', 'FLAC'],
    ['alac', 'ALAC'],
    ['ape', "MONKEY'S"],
    ['wv', 'WAVPACK'],
    ['wavpack', 'WAVPACK'],
    ['aif', 'AIFF'],
    ['AIFC', 'AIFF'],
    ['dsf', 'DSD'],
    ['dff', 'DSD'],
    ['dsd_msbf', 'DSD'],
    ['wmapro', 'WMA'],
    ['wmavoice', 'WMA-VOICE'],
    ['w64', 'WAV'],
    ['pcm', 'WAV'],
    ['pcm_s24le', 'WAV'],
    ['ac3', 'AC-3'],
    ['mp3', 'MP3'],
    ['aac', 'AAC'],
    ['ogg', 'OGG'],
    ['mp4', 'M4A'],
    ['mov,mp4,m4a,3gp,3g2,mj2', 'M4A'],
    ['matroska,webm', 'MATROSKA'],
  ])('names %s %s', (given, name) => {
    expect(toCodecName(given)).toBe(name);
  });

  it.each(["MONKEY'S", 'WAVPACK', 'AIFF-C', 'AC-3', 'IEEE_FLOAT', 'DVI_ADPCM', 'M4A', 'MATROSKA'])('keeps %s, a name that it gave', (name) => {
    expect(toCodecName(name)).toBe(name);
  });

  it.each([undefined, null, ''])('has no name for %j', (given) => {
    expect(toCodecName(given)).toBeNull();
  });
});

describe('isAmbiguousContainer', () => {
  it.each([
    ['M4A', true],
    ['MATROSKA', true],
    ['ALAC', false],
    [null, false],
  ])('says of %s: %s', (codec, ambiguous) => {
    expect(isAmbiguousContainer(codec)).toBe(ambiguous);
  });
});
