import { describe, expect, it } from 'vitest';
import { resolveLocation } from './resolve-location';

describe('resolveLocation', () => {
  it.each([
    ['/music/a.flac', '/lists', '/music/a.flac'],
    ['C:\\Music\\a.flac', '/lists', 'C:/Music/a.flac'],
    ['..\\Artist\\a.flac', '/music/lists', '/music/Artist/a.flac'],
    ['a.flac', 'C:/Music/lists', 'C:/Music/lists/a.flac'],
    ['file:///home/me/Music/a%20b.flac', '/lists', '/home/me/Music/a b.flac'],
    ['file:///C:/Music/a.flac', '/lists', 'C:/Music/a.flac'],
    ['file://nas/share/a.flac', '/lists', '//nas/share/a.flac'],
    ['file:///music/100%.flac', '/lists', '/music/100%.flac'],
    ['./#1.flac', '/lists', '/lists/#1.flac'],
    ['a%20b.flac', '/lists', '/lists/a%20b.flac'],
  ])('takes %s in %s as %s', (location, folder, expected) => {
    expect(resolveLocation(location, folder)).toEqual({ kind: 'file', path: expected });
  });

  it('takes an address on the network for a stream', () => {
    expect(resolveLocation('https://radio.example/live.mp3', '/lists')).toEqual({ kind: 'stream' });
  });
});
