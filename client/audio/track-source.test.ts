import { describe, expect, it } from 'vitest';
import type { Track } from '@shared/types/library';
import { toRemoteTrack } from '../domain/remote-track';
import { isFileTrack, sourceOf } from './track-source';

const track = (path: string) => ({ path }) as Track;
const remote = toRemoteTrack({ state: 'playing', title: 'A&B', position: 0, at: 0 });

describe('track source', () => {
  it('plays a file through its path, a station through the radio and a stream from its address', () => {
    expect(sourceOf(track('/music/a b.flac'))).toBe('tunelle://app/track?path=%2Fmusic%2Fa%20b.flac');
    expect(sourceOf(track('radio:abc'))).toBe('tunelle://app/radio/abc');
    expect(sourceOf(track('http://example.com/s'))).toBe('http://example.com/s');
  });

  it('plays the track of the host through the relay with its key', () => {
    expect(sourceOf(remote)).toBe(`tunelle://app/remote/audio?t=${remote.path.slice('remote://'.length)}`);
  });

  it('measures and preloads files only', () => {
    expect(isFileTrack(track('/music/a.flac'))).toBe(true);
    expect(isFileTrack(track('radio:abc'))).toBe(false);
    expect(isFileTrack(remote)).toBe(false);
    expect(isFileTrack(null)).toBe(false);
  });
});
