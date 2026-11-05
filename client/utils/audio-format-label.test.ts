import { describe, expect, it } from 'vitest';
import type { Track } from '@shared/types/library';
import { albumFormatLabel, audioFormatLabel } from './audio-format-label';

const track = (format: Partial<Track>): Track => ({
  path: '/music/a',
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
  ...format,
});

describe('audioFormatLabel', () => {
  it.each([
    [{ codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000, bitrate: 2800000 }, 'FLAC 24/96'],
    [{ codec: 'FLAC', lossless: 1, bitDepth: 16, sampleRate: 44100, bitrate: 900000 }, 'FLAC 16/44.1'],
    [{ codec: 'ALAC', lossless: 1, bitDepth: 24, sampleRate: 88200 }, 'ALAC 24/88.2'],
    [{ codec: 'FLAC', lossless: 1 }, 'FLAC'],
    [{ codec: 'MP3', lossless: 0, bitrate: 320000 }, 'MP3 320'],
    [{ codec: 'MP3', lossless: 0, bitrate: 245000, vbr: 1 }, 'MP3 V'],
    [{ codec: 'AAC', bitrate: 127600 }, 'AAC 128'],
    [{ codec: 'OPUS', lossless: 0 }, 'OPUS'],
  ])('shows %o as %s', (format, label) => {
    expect(audioFormatLabel(track(format))).toBe(label);
  });

  it('shows nothing for a track whose codec is not known', () => {
    expect(audioFormatLabel(track({}))).toBeUndefined();
    expect(audioFormatLabel(track({ codec: null, bitrate: 320000 }))).toBeUndefined();
  });
});

describe('albumFormatLabel', () => {
  it.each([
    [{ codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000 }, 'Hi-Res'],
    [{ codec: 'FLAC', lossless: 1, bitDepth: 16, sampleRate: 96000 }, 'Hi-Res'],
    [{ codec: 'FLAC', lossless: 1, bitDepth: 16, sampleRate: 44100 }, 'FLAC'],
    [{ codec: 'FLAC', lossless: 1 }, 'FLAC'],
    [{ codec: 'AAC', lossless: 0, bitDepth: 24, sampleRate: 96000 }, 'AAC'],
    [{ codec: 'MP3', lossless: 0, bitrate: 320000 }, 'MP3'],
  ])('shows %o as %s', (format, label) => {
    expect(albumFormatLabel(format)).toBe(label);
  });

  it('shows nothing for an album whose codec is not known', () => {
    expect(albumFormatLabel({})).toBeUndefined();
    expect(albumFormatLabel({ codec: null, lossless: 1, bitDepth: 24 })).toBeUndefined();
  });
});
