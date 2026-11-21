import { describe, expect, it } from 'vitest';
import { coverRouteOf, optimizedCoverOf } from './cover-url';

describe('coverRouteOf', () => {
  it.each([
    ['cover-abc.jpg', 'cover-abc'],
    ['/data/albumart/cover-abc.png', 'cover-abc'],
    ['C:\\data\\albumart\\cover-abc.jpg', 'cover-abc'],
    ['no-extension', 'no-extension'],
  ])('points %s at its optimized copy', (picture, name) => {
    expect(coverRouteOf(picture)).toBe(`/albumart/${name}-optimized.png`);
  });

  it('keeps a name with URL characters inside the path', () => {
    expect(coverRouteOf('/data/albumart/a?b#c.jpg')).toBe('/albumart/a%3Fb%23c-optimized.png');
  });

  it('points the path of a cover on a server at the cover route of the server', () => {
    const path = 'plex:5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11:7';

    expect(coverRouteOf(path)).toBe(`/source/cover?path=${encodeURIComponent(path)}`);
  });

  it('names the optimized file for the host to serve, without a folder', () => {
    expect(optimizedCoverOf('C:\\data\\albumart\\cover-abc.jpg')).toBe('cover-abc-optimized.png');
  });
});
