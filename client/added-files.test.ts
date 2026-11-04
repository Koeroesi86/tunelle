import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toAddedFiles from './added-files';

const fileOf = (name: string, webkitRelativePath: string, lastModified = 1) => Object.assign(new File([''], name, { lastModified }), { webkitRelativePath });

describe('toAddedFiles', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(9);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a dropped folder as it is', () => {
    const folder = fileOf('Music', '', 5);

    expect(toAddedFiles([folder], () => '/home/me/Music')).toEqual([{ name: 'Music', path: '/home/me/Music', lastModified: 5 }]);
  });

  it('collapses the files of a picked folder into the folder, once', () => {
    const files = [fileOf('a.flac', 'Music/a.flac'), fileOf('b.flac', 'Music/Album/b.flac')];
    const paths = new Map([
      [files[0], '/home/me/Music/a.flac'],
      [files[1], '/home/me/Music/Album/b.flac'],
    ]);

    expect(toAddedFiles(files, (file) => paths.get(file) ?? '')).toEqual([{ name: 'Music', path: '/home/me/Music', lastModified: 9 }]);
  });

  it('works with Windows separators', () => {
    const file = fileOf('a.flac', 'Music/a.flac');

    expect(toAddedFiles([file], () => 'C:\\Users\\me\\Music\\a.flac')).toEqual([{ name: 'Music', path: 'C:\\Users\\me\\Music', lastModified: 9 }]);
  });
});
