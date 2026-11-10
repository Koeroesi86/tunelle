import { describe, expect, it } from 'vitest';
import readAudioFormat from './read-audio-format';

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
    [{ codec: 'Windows Media Audio V8', container: 'ASF/audio' }, 'WMA', undefined],
    [{ codec: 'Windows Media Audio 10 Professional', container: 'ASF/audio' }, 'WMA', undefined],
    [{ codec: 'Windows Media Audio 9 Lossless', container: 'ASF/audio' }, 'WMA', 1],
    [{ codec: 'Windows Media Audio 9 Voice', container: 'ASF/audio' }, 'WMA-VOICE', undefined],
  ])('names %o %s', (format, codec, lossless) => {
    expect(readAudioFormat(format)).toMatchObject({ codec, lossless: lossless ?? null });
  });

  it.each([
    [{ codec: 'PCM', container: 'WAVE' }, 'WAV'],
    [{ codec: 'PCM', container: 'AIFF' }, 'AIFF'],
    [{ codec: 'PCM (byte swapped)', container: 'AIFF-C' }, 'AIFF-C'],
    [{ codec: 'AAC LC', container: 'M4A' }, 'AAC'],
    [{ codec: 'Vorbis I', container: 'Ogg' }, 'VORBIS'],
    [{ container: 'Matroska' }, 'MATROSKA'],
    [{ container: 'DSF' }, 'DSD'],
    [{ codec: 'DSD (DSD uncompressed)', container: 'DSDIFF/DSD' }, 'DSD'],
    [{ container: 'DSDIFF/DSD' }, 'DSD'],
    [{ codec: 'DST (DST compressed)', container: 'DSDIFF/DSD' }, 'DST'],
    [{ codec: 'DSD', container: 'WavPack' }, 'DSD-WAVPACK'],
    [{ codec: 'PCM', container: 'WavPack' }, 'WAVPACK'],
  ])('names %o as %s', (format, codec) => {
    expect(readAudioFormat(format).codec).toBe(codec);
  });

  it('shows DSD as lossless with its 1 bit and its rate, which DSF does not say', () => {
    expect(readAudioFormat({ container: 'DSF', bitsPerSample: 1, sampleRate: 2822400, bitrate: 5644800 })).toMatchObject({
      codec: 'DSD',
      bitDepth: 1,
      sampleRate: 2822400,
      lossless: 1,
    });
  });

  it('leaves out what the file does not tell', () => {
    expect(readAudioFormat({})).toEqual({ codec: null, bitDepth: null, sampleRate: null, bitrate: null, vbr: null, lossless: null });
  });
});
