import { describe, expect, it } from 'vitest';
import readAudioFormat from './readAudioFormat';

describe('readAudioFormat', () => {
  it('reads a lossless file with its depth and rate', () => {
    expect(readAudioFormat({ codec: 'FLAC', container: 'FLAC', lossless: true, bitsPerSample: 24, sampleRate: 96000, bitrate: 2800000.4 })).toEqual({
      codec: 'FLAC',
      bitDepth: 24,
      sampleRate: 96000,
      bitrate: 2800000,
      vbr: null,
      lossless: 1,
    });
  });

  it.each([
    ['CBR', 0],
    ['ABR', 0],
    ['VBR', 1],
    ['V0', 1],
  ])('reads a %s MP3 as vbr %s and names it by its common name', (codecProfile, vbr) => {
    expect(readAudioFormat({ codec: 'MPEG 1 Layer 3', container: 'MPEG', lossless: false, bitrate: 320000, codecProfile })).toMatchObject({
      codec: 'MP3',
      vbr,
      lossless: 0,
    });
  });

  it.each([
    [{ codec: 'PCM', container: 'WAVE' }, 'WAV'],
    [{ codec: 'PCM', container: 'AIFF' }, 'AIFF'],
    [{ codec: 'AAC LC', container: 'M4A' }, 'AAC'],
    [{ codec: 'Vorbis I', container: 'Ogg' }, 'VORBIS'],
    [{ container: 'Matroska' }, 'MATROSKA'],
  ])('names %o as %s', (format, codec) => {
    expect(readAudioFormat(format).codec).toBe(codec);
  });

  it('leaves out what the file does not tell', () => {
    expect(readAudioFormat({})).toEqual({ codec: null, bitDepth: null, sampleRate: null, bitrate: null, vbr: null, lossless: null });
  });
});
