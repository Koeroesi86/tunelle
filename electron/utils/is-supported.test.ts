import { describe, expect, it } from 'vitest';
import isSupported from './is-supported';

describe('isSupported', () => {
  it.each(['a.flac', 'a.mp3', 'a.m4a', 'a.ogg', 'a.opus', 'a.wav', 'a.aac', 'a.mp4', 'C:/Music/b.flac'])('accepts %s', (name) => {
    expect(isSupported(name)).toBe(true);
  });

  it.each(['a.ape', 'a.wma', 'a.aiff', 'a.wv', 'a.mp2', 'a.asf', 'a.txt', 'a'])('rejects %s, which the player cannot play', (name) => {
    expect(isSupported(name)).toBe(false);
  });
});
