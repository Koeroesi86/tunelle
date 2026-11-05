import { describe, expect, it } from 'vitest';
import { getCoverUrl } from './cover-url';

describe('getCoverUrl', () => {
  it.each([
    ['cover-abc.jpg', 'cover-abc'],
    ['/data/albumart/cover-abc.png', 'cover-abc'],
    ['C:\\data\\albumart\\cover-abc.jpg', 'cover-abc'],
    ['no-extension', 'no-extension'],
  ])('points %s at its optimized copy', (picture, name) => {
    expect(getCoverUrl(picture)).toBe(`tunelle://app/albumart/${name}-optimized.png`);
  });

  it('keeps a name with URL characters inside the path', () => {
    expect(getCoverUrl('/data/albumart/a?b#c.jpg')).toBe('tunelle://app/albumart/a%3Fb%23c-optimized.png');
  });
});
