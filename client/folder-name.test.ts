import { describe, expect, it } from 'vitest';
import { displayFolderPath, splitFolderPath } from './folder-name';

describe('splitFolderPath', () => {
  it.each([
    ['/home/me/Music/Jazz', 'Jazz', '/home/me/Music/'],
    ['/home/me/Music/Jazz/', 'Jazz', '/home/me/Music/'],
    ['C:\\Users\\me\\Music', 'Music', 'C:\\Users\\me\\'],
    ['/Music', 'Music', '/'],
  ])('splits %s', (path, name, parent) => {
    expect(splitFolderPath(path)).toEqual({ name, parent });
  });

  it('keeps a root as its own name', () => {
    expect(splitFolderPath('/')).toEqual({ name: '/', parent: '' });
  });
});

describe('displayFolderPath', () => {
  it.each([
    ['/run/user/1000/doc/a1b2c3d4/Music', 'Music'],
    ['/run/user/1000/doc/a1b2c3d4/Music/Jazz/Live', 'Music/Jazz/Live'],
    ['/home/me/Music', '/home/me/Music'],
    ['/run/user/1000/doc/a1b2c3d4', '/run/user/1000/doc/a1b2c3d4'],
  ])('shows %s as %s', (path, shown) => {
    expect(displayFolderPath(path)).toBe(shown);
  });
});
