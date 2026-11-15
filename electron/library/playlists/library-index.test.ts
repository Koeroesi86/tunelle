import { describe, expect, it } from 'vitest';
import { createLibraryIndex, findInLibrary } from './library-index';

const index = createLibraryIndex([
  '/home/me/Music/Artist/Album/01 Intro.flac',
  '/home/me/Music/Other/Album/01 Intro.flac',
  '/home/me/Music/Árvíz/dal.flac',
  '/home/me/Music/Case/Song.flac',
  '/home/me/Music/Case/song.flac',
  '/home/me/Music/Only/Unique Name.flac',
]);

describe('findInLibrary', () => {
  it('finds the same path, also when it is spelled decomposed as macOS does', () => {
    expect(findInLibrary(index, '/home/me/Music/Artist/Album/01 Intro.flac')).toBe('/home/me/Music/Artist/Album/01 Intro.flac');
    expect(findInLibrary(index, '/home/me/Music/A\u0301rví\u0301z/dal.flac'.normalize('NFD'))).toBe('/home/me/Music/Árvíz/dal.flac');
  });

  it('finds a path of another case when it is the only one, and none when two files are', () => {
    expect(findInLibrary(index, '/HOME/me/music/only/unique name.flac')).toBe('/home/me/Music/Only/Unique Name.flac');
    expect(findInLibrary(index, '/home/me/music/case/SONG.flac')).toBeUndefined();
  });

  it('finds the file of a Windows path by its name and the tail of its path', () => {
    expect(findInLibrary(index, 'C:/Users/me/Music/Other/Album/01 Intro.flac')).toBe('/home/me/Music/Other/Album/01 Intro.flac');
    expect(findInLibrary(index, 'D:/Different/Unique Name.flac')).toBe('/home/me/Music/Only/Unique Name.flac');
  });

  it('does not guess between files that have the same name and tail', () => {
    expect(findInLibrary(index, 'D:/Album/01 Intro.flac')).toBeUndefined();
    expect(findInLibrary(index, '/nowhere/missing.flac')).toBeUndefined();
  });
});
